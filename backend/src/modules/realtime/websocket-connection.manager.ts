import { FastifyRequest } from "fastify";
import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { ConnectionService } from "./connection.service";
import { RoomService } from "./room.service";
import { MessageService } from "./message.service";
import { EventService } from "./event.service";
import { SyncService } from "./sync.service";


export interface WebSocketConnection {
  socketId: string;
  userId: string;
  name: string;
  connectionId: string;
  socket: any; // WebSocket instance
  entityManager: EntityManager; // Connection-specific EntityManager for each connection
}

export class WebSocketConnectionManager {
  private connections = new Map<string, WebSocketConnection>(); // socketId -> WebSocketConnection
  private pingIntervals = new Map<string, NodeJS.Timeout>(); // socketId -> pingInterval
  private pendingPings = new Map<string, { timestamp: number; missedPongs: number }>(); // socketId -> ping info
  private messageBuffer = new Map<string, any[]>(); // userId -> buffered messages

  constructor(
    private connectionService: ConnectionService,
    private roomService: RoomService,
    private messageService: MessageService,
    private eventService: EventService,
    private syncService: SyncService
  ) {}

  async createConnection(connection: any, request: FastifyRequest): Promise<WebSocketConnection | null> {
    if (!connection.socket) {
      console.error('No WebSocket socket provided by Fastify');
      return null;
    }

    const socketId = `socket_${Date.now()}_${randomUUID()}`;

    // Get user info from JWT token
    const user = request.user as any;
    if (!user || !user.id) {
      console.error('No user info found in JWT token');
      this.closeConnection(connection.socket, 'No user info available');
      return null;
    }

    const { id: userId, name, email } = user;
    const connectionId = randomUUID();

    const wsConnection: WebSocketConnection = {
      socketId,
      userId,
      name,
      connectionId,
      socket: connection.socket,
      entityManager: request.entityManager
    };

    // Store connection
    this.connections.set(socketId, wsConnection);

    // Register with connection service
    this.connectionService.createConnection(connectionId, socketId, email, userId, name);

    // Emit online status
    this.eventService.emitUserStatusUpdate({ userId, isOnline: true });

    // Initialize connection
    await this.initializeConnection(wsConnection);

    return wsConnection;
  }

  private async initializeConnection(wsConnection: WebSocketConnection) {
    if (wsConnection.entityManager) {
      await this.flushBufferedMessages(wsConnection.userId);
      await this.restoreUserSession(wsConnection);
    } else {
      await this.waitForEntityManager(wsConnection);
    }

    this.setupPingInterval(wsConnection);
  }

  private async restoreUserSession(wsConnection: WebSocketConnection) {
    try {
      await this.syncService.restoreUserSession(
        wsConnection.entityManager!,
        wsConnection.userId,
        (message) => this.sendMessage(wsConnection, message)
      );
    } catch (error) {
      console.error('Error restoring user session:', error);
    }
  }

  // Wait for EntityManager to become available
  private async waitForEntityManager(wsConnection: WebSocketConnection) {
    console.error('EntityManager is not available, waiting for it to become available...');

    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = 1000;

    const attemptCheck = async () => {
      if (wsConnection.entityManager) {
        await this.restoreUserSession(wsConnection);
      } else {
        retryCount++;
        if (retryCount < maxRetries) {
          setTimeout(attemptCheck, retryInterval);
        } else {
          console.error(`EntityManager not available after ${maxRetries} attempts, closing connection`);
          this.handleConnectionClose(wsConnection.socketId);
        }
      }
    };

    attemptCheck();
  }

  // Setup ping interval
  private setupPingInterval(wsConnection: WebSocketConnection) {
    const pingInterval = setInterval(() => {
      if (wsConnection.socket.readyState === WebSocket.OPEN) {
        this.sendPingAndTrack(wsConnection);
      } else {
        this.handleConnectionClose(wsConnection.socketId);
      }
    }, 30000); // 30 seconds

    this.pingIntervals.set(wsConnection.socketId, pingInterval);
  }

  // Send ping and track connection status
  private sendPingAndTrack(wsConnection: WebSocketConnection) {
    const socketId = wsConnection.socketId;
    const pendingPing = this.pendingPings.get(socketId);

    if (pendingPing) {
      const timeSinceLastPing = new Date().getTime() - pendingPing.timestamp;

      if (timeSinceLastPing > 60000) {
        pendingPing.missedPongs++;
        console.warn(`Missed pong from ${wsConnection.userId} (${pendingPing.missedPongs}/3)`);

        if (pendingPing.missedPongs >= 3) {
          console.error(`Connection ${socketId} unresponsive after 3 missed pongs, closing connection`);
          this.handleConnectionClose(socketId);
          return;
        }
      }
    }

    const pingMessage = this.messageService.createPingMessage();
    this.sendMessage(wsConnection, pingMessage);

    this.pendingPings.set(socketId, {
      timestamp: new Date().getTime(),
      missedPongs: pendingPing?.missedPongs || 0
    });
  }

  // Handle pong response (called by WebSocketMessageHandler)
  handlePongReceived(socketId: string) {
    const pendingPing = this.pendingPings.get(socketId);
    if (pendingPing) {
      this.pendingPings.delete(socketId);
    }
  }

  // Handle connection close
  async handleConnectionClose(socketId: string) {
    const wsConnection = this.connections.get(socketId);
    if (!wsConnection) return;

    // Clear ping interval
    const pingInterval = this.pingIntervals.get(socketId);
    if (pingInterval) {
      clearInterval(pingInterval);
      this.pingIntervals.delete(socketId);
    }
    this.pendingPings.delete(socketId);

    // Remove from connection tracking BEFORE emitting status
    // so isUserOnline() returns false when the event listener checks it
    this.connectionService.removeConnection(wsConnection.connectionId);
    this.connections.delete(socketId);

    // Emit offline status after removal
    await this.eventService.emitUserStatusUpdate({ userId: wsConnection.userId, isOnline: false });

    // Clean up EntityManager
    if (wsConnection.entityManager) {
      try {
        wsConnection.entityManager.clear();
      } catch (error) {
        console.error('Error clearing EntityManager:', error);
      }
    }
  }

  sendMessage(wsConnection: WebSocketConnection, message: any) {
    try {
      if (wsConnection.socket.readyState === 1) { // WebSocket.OPEN
        wsConnection.socket.send(JSON.stringify(message));
      } else {
        this.bufferMessage(wsConnection.userId, message);
        this.handleConnectionClose(wsConnection.socketId);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.bufferMessage(wsConnection.userId, message);
      this.handleConnectionClose(wsConnection.socketId);
    }
  }

  // Add message to buffer
  bufferMessage(userId: string, message: any) {
    if (!this.messageBuffer.has(userId)) {
      this.messageBuffer.set(userId, []);
    }
    const buffer = this.messageBuffer.get(userId)!;
    buffer.push(message);

    // Limit buffer size to 1000 messages
    if (buffer.length > 1000) {
      buffer.shift();
    }
  }

  // Flush buffered messages on reconnect
  async flushBufferedMessages(userId: string): Promise<void> {
    const buffer = this.messageBuffer.get(userId);
    if (!buffer || buffer.length === 0) return;

    const connections = this.getUserConnections(userId);
    for (const connection of connections) {
      for (const message of buffer) {
        try {
          if (connection.socket.readyState === WebSocket.OPEN) {
            connection.socket.send(JSON.stringify(message));
          }
        } catch (error) {
          console.warn('Failed to send buffered message:', error);
        }
      }
    }
    this.messageBuffer.delete(userId);
  }

  private closeConnection(socket: any, reason: string) {
    try {
      socket.close(1008, reason);
    } catch (error) {
      console.error('Failed to close WebSocket connection:', error);
    }
  }

  getConnection(socketId: string): WebSocketConnection | undefined {
    return this.connections.get(socketId);
  }

  getAllConnections(): WebSocketConnection[] {
    return Array.from(this.connections.values());
  }

  getUserConnections(userId: string): WebSocketConnection[] {
    return Array.from(this.connections.values()).filter(conn => conn.userId === userId);
  }
}
