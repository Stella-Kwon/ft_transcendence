import { FastifyRequest } from "fastify";
import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { WebSocket } from 'ws';
import { MessageService } from "./message.service";
import { EventService } from "./event.service";
import { SyncService } from "./sync.service";


export interface WebSocketConnection {
  socketId: string;
  userId: string;
  email: string;
  name: string;
  socket: any; // WebSocket instance
  entityManager: EntityManager; // Connection-specific EntityManager for each connection
}

export class WsConnectionService {
  private connections = new Map<string, WebSocketConnection>(); // socketId -> WebSocketConnection
  private userWebConnection = new Map<string, Set<WebSocketConnection>>(); // userId -> Set<WebSocketConnection>
  private pingIntervals = new Map<string, NodeJS.Timeout>(); // socketId -> pingInterval
  private pendingPings = new Map<string, { timestamp: number; missedPongs: number }>(); // socketId -> ping info
  private messageBuffer = new Map<string, any[]>(); // userId -> buffered messages

  constructor(
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

    const wsConnection: WebSocketConnection = {
      socketId,
      userId,
      email,
      name,
      socket: connection.socket,
      entityManager: request.entityManager,
    };

    // Store connection
    this.connections.set(socketId, wsConnection);
    if (!this.userWebConnection.has(userId)) {
      this.userWebConnection.set(userId, new Set());
    }
    this.userWebConnection.get(userId)!.add(wsConnection);

    // Emit online status
    this.eventService.emitUserStatusUpdate({ userId, isOnline: true });

    // Initialize connection
    await this.initializeConnection(wsConnection);

    return wsConnection;
  }

  private async initializeConnection(wsConnection: WebSocketConnection) {
    if (wsConnection.entityManager) {
      await this.flushBufferedMessages(wsConnection.userId); // better doing in data-base for server crash reason. fix for later
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

  // Wait for EntityManager to become available -
  private async waitForEntityManager(wsConnection: WebSocketConnection) {
    console.error('EntityManager is not available, waiting for it to become available...');

    const maxRetries = 10;
    const retryInterval = 1000;

    for (let retryCount = 0; retryCount < maxRetries; retryCount++) {
      await new Promise(resolve => setTimeout(resolve, retryInterval));
      if (wsConnection.entityManager) {
        await this.restoreUserSession(wsConnection);
        return;
      }
    }

    console.error(`EntityManager not available after ${maxRetries} attempts, closing connection`);
    this.handleConnectionClose(wsConnection.socketId);
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

        if (pendingPing.missedPongs >= 3) {
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
    this.connections.delete(socketId);
    const userConns = this.userWebConnection.get(wsConnection.userId);
    if (userConns) {
      userConns.delete(wsConnection);
      if (userConns.size === 0) this.userWebConnection.delete(wsConnection.userId);
    }

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

  //no async due to prevent mixing up the sequence in bufferMessage
  sendMessage(wsConnection: WebSocketConnection, message: any) {
    try {
      if (wsConnection.socket.readyState === WebSocket.OPEN) {
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
      console.warn(`Message buffer full for user ${userId}, oldest message dropped`);
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
    return Array.from(this.userWebConnection.get(userId) ?? new Set());
  }

  isUserOnline(userId: string): boolean {
    return this.userWebConnection.has(userId);
  }

  getConnectionByUserId(userId: string): WebSocketConnection | undefined {
    const userConns = this.userWebConnection.get(userId);
    if (!userConns || userConns.size === 0) return undefined;
    return userConns.values().next().value;
  }

  getOnlineUsers(): WebSocketConnection[] {
    return Array.from(this.userWebConnection.values())
      .map(conns => conns.values().next().value!);
  }
}
