import { FastifyPluginAsync, FastifyInstance, FastifyPluginOptions } from "fastify";
import fastifyWebsocket from "@fastify/websocket";
import { RoomService } from "./room.service";
import { MessageService } from "./message.service";
import { EventService } from "./event.service";
import { SyncService } from "./sync.service";
import { EventListenerService } from "./event-listener.service";
import { WsConnectionService, WebSocketConnection } from "./ws-connection.service";
import { WebSocketMessageHandler } from "./websocket-message.handler";
import { WebSocketErrorHandler } from "./websocket-error-handler";
import { AnyMessage } from "./dto";

export class WebSocketService {
  private messageHandler: WebSocketMessageHandler;

  constructor(
    private roomService: RoomService,
    private wsConnectionService: WsConnectionService,
    private messageService: MessageService,
    private eventService: EventService,
    private syncService: SyncService,
    private eventListenerService: EventListenerService
  ) {
    this.messageHandler = new WebSocketMessageHandler(
      this.messageService,
      this.syncService,
      this.roomService,
      this.eventService,
      this.wsConnectionService
    );

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.eventListenerService.setupEventListeners(
      (userId: string, message: AnyMessage) => this.sendToUser(userId, message),
      (roomId: string, message: AnyMessage) => this.broadcastToRoom(roomId, message)
    );
  }

  // Fastify plugin for WebSocket support
  plugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
    await fastify.register(fastifyWebsocket);

    fastify.get('/ws', { websocket: true } as any, (connection: any, req: any) => {
      let socket: any = null;
      //depends on the version or execution env receiving readystate field.
      if (connection.socket && connection.socket.readyState !== undefined) {
        socket = connection.socket;
      } else if (connection.readyState !== undefined) {
        socket = connection;
      } else {
        console.error('No valid WebSocket found in connection object');
        return;
      }
      this.handleWebSocketConnection({ socket }, req);
    });
  };

  private async handleWebSocketConnection(connection: any, request: any) {
    try {
      const authResult = this.verifyUser(request);

      if (!authResult.success) {
        console.error('WebSocket authentication failed:', authResult.error);
        if (connection && connection.socket) {
          connection.socket.close(1008, authResult.error);
           console.error('connection socket closed within 1008 code: ', authResult.error);
        }
        return;
      }

      const { user } = authResult;
      request.user = user;

      const wsConnection = await this.wsConnectionService.createConnection(connection, request);

      if (!wsConnection) {
        console.error('Failed to create WebSocket connection');
        return;
      }

      connection.socket.on('message', async (data: Buffer) => {
        await this.handleMessage(wsConnection, data);
      });

      connection.socket.on('close', async () => {
        await this.wsConnectionService.handleConnectionClose(wsConnection.socketId);
      });

      connection.socket.on('error', async (error: Error) => {
        await this.wsConnectionService.handleConnectionClose(wsConnection.socketId);
      });
    } catch (error) {
      console.error('WebSocket connection error:', error);
      if (connection && connection.socket) {
        try {
          connection.socket.close(1011, 'Internal server error');
        } catch (closeError) {
          console.error('Error closing socket:', closeError);
        }
      }
    }
  }

  private verifyUser(request: any): {
    success: boolean;
    user?: any;
    authMethod?: string;
    error?: string;
  } {
    let accessToken = '';

    if (request.headers?.cookie) {
      const accessTokenMatch = request.headers.cookie.match(/accessToken=([^;]+)/);
      if (accessTokenMatch) {
        accessToken = accessTokenMatch[1];
      }
    }

    if (!accessToken) {
      return {
        success: false,
        error: 'No token found in cookies'
      };
    }

    try {
      const decoded = request.server.jwt.verify(accessToken);

      if (!decoded.id || !decoded.name) {
        console.error('Invalid user data in token:', decoded);
        return {
          success: false,
          error: 'Invalid user data in token'
        };
      }

      return {
        success: true,
        user: decoded,
        authMethod: 'cookie'
      };
    } catch (error) {
      console.error('JWT verification failed:', error);
      return {
        success: false,
        error: 'Invalid JWT token'
      };
    }
  }

  private async handleMessage(wsConnection: WebSocketConnection, data: Buffer) {
    let message: any;

    try {//buffer->string
      const rawMessage = data.toString();

      try {
        message = JSON.parse(rawMessage); //string->jsObject
      } catch (parseError) {
        console.error('Invalid JSON received:', parseError);
        const errorMessage = WebSocketErrorHandler.createErrorMessage('INVALID_JSON', 'Invalid JSON format');
        this.sendMessage(wsConnection, errorMessage);
        return;
      }

      await this.messageHandler.handleMessage(
        wsConnection.entityManager,
        message,
        wsConnection.userId,
        wsConnection.name,
        (msg: any) => this.sendToUser(wsConnection.userId, msg),
        (roomId: string, msg: any) => this.broadcastToRoom(roomId, msg),
        wsConnection.socketId
      );

    } catch (error) {
      console.error('Error handling message:', error);

      const errorMessage = WebSocketErrorHandler.createErrorMessage(
        'MESSAGE_PROCESSING_ERROR',
        'Failed to process message. Please try again.',
        {
          originalMessage: message?.id || 'unknown',
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      );

      this.sendMessage(wsConnection, errorMessage);
    }
  }

  private sendMessage(wsConnection: WebSocketConnection, message: AnyMessage) {
    this.wsConnectionService.sendMessage(wsConnection, message);
  }

  async sendToUser(userId: string, message: AnyMessage): Promise<void> {
    const connections = this.wsConnectionService.getUserConnections(userId);

    if (connections.length === 0) {
      this.wsConnectionService.bufferMessage(userId, message);
      return;
    }

    for (const wsConnection of connections) {
      this.wsConnectionService.sendMessage(wsConnection, message);
    }
  }

  private async broadcastToRoom(roomId: string, message: AnyMessage): Promise<void> {
    const userIds = this.roomService.getRoomMembersFromMemory(roomId);

    await Promise.allSettled(userIds.map(id => this.sendToUser(id, message)));
  }
}
