import type {
  AnyMessage,
  ChatMessage,
  PingMessage,
  ConnectionStatus,
  WebSocketEventHandlers,
  PongMessage,
  UnreadCountMessage,
  RoomJoinedMessage,
  LeaveRoomMessage,
  FriendRequestMessage,
  FriendRequestResponseMessage,
  FriendListResponseMessage,
  UserStatusMessage,
  RoomStateMessage
} from '../types/realtime.types';
import { useAuth } from '../stores/useAuth';


const generateId = (): string => {
  return crypto.randomUUID();
};

export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private pingInterval: NodeJS.Timeout | null = null;
  private eventHandlers: WebSocketEventHandlers = {};
  private connectionStatus: ConnectionStatus = 'disconnected';

  async connect(handlers: WebSocketEventHandlers = {}): Promise<void> {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };

    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }

      if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//localhost:3000/api/realtime/ws`;

      this.ws = new WebSocket(wsUrl);
      this.connectionStatus = 'connecting';

      this.ws.onopen = () => {
        this.connectionStatus = 'connected';
        this.reconnectAttempts = 0;
        this.eventHandlers.onOpen?.();
        this.startPingInterval();
      };

      this.ws.onclose = (event) => {
        this.disconnect();
        this.eventHandlers.onClose?.();

        if (event.code === 1008) {
          this.handleAuthFailure();
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => this.attemptReconnect(), this.reconnectDelay);
        } else {
          this.handleAuthFailure();
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.connectionStatus = 'error';
        this.eventHandlers.onError?.(error);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.connectionStatus = 'error';
      throw error;
    }
  }

  disconnect(): void {
    this.stopPingInterval();
    if (this.ws && this.ws.readyState !== WebSocket.CLOSED) {
      this.ws.close();
      this.ws = null;
    }
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(message: AnyMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket is not connected', { readyState: this.ws?.readyState });
      return;
    }

    this.ws.send(JSON.stringify(message));
  }

  sendChatMessage(roomId: string, content: string): void {
    const user = useAuth.getState().user;
    if (!user) {
      console.error('User not authenticated, cannot send message');
      return;
    }
    const message: ChatMessage = {
      id: generateId(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'chat',
      payload: {
        roomId,
        userId: user.id,
        name: user.name,
        content,
        messageType: 'text'
      }
    };

    this.send(message);
  }

  markMessageAsRead(roomId: string, messageTimestamp: number): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`WebSocket not open, cannot send mark read request`);
      return;
    }

    const message = {
      id: generateId(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'mark_read' as const,
      payload: {
        roomId,
        lastReadTimestamp: messageTimestamp
      }
    };

    this.send(message);
  }

  requestRoomSync(roomId: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error(`WebSocket not open, cannot send room sync request for room: ${roomId}`);
      return;
    }

    const message = {
      id: generateId(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'room_state' as const,
      payload: {
        room: {
          id: roomId,
          name: '',
          masterId: '',
          description: '',
          isPrivate: false,
          maxUsers: 50,
          memberCount: 0,
          createdAt: Date.now(),
          updatedAt: Date.now()
        },
        previousMessages: [],
        unreadMessages: [],
        members: [],
        readState: {
          lastReadTimestamp: 0,
          unreadCount: 0,
          totalMessages: 0
        }
      }
    };

    this.send(message);
  }

  sendPing(): void {
    const message: PingMessage = {
      id: generateId(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'ping'
    };

    this.send(message);
  }

  sendPong(): void {
    const message: PongMessage = {
      id: generateId(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'pong',
      payload: {}
    };
    this.send(message);
  }

  private handleMessage(message: AnyMessage): void {
    switch (message.type) {
      case 'chat':
        this.eventHandlers.onChatMessage?.(message as ChatMessage);
        break;
      case 'room_joined':
        this.eventHandlers.onRoomJoined?.(message as RoomJoinedMessage);
        break;
      case 'leave_room':
        this.eventHandlers.onLeaveRoom?.(message as LeaveRoomMessage);
        break;
      case 'unread_count':
        this.eventHandlers.onUnreadCount?.(message as UnreadCountMessage);
        break;
      case 'friend_request':
        this.eventHandlers.onFriendRequest?.(message as FriendRequestMessage);
        break;
      case 'friend_request_response':
        this.eventHandlers.onFriendRequestResponse?.(message as FriendRequestResponseMessage);
        break;
      case 'friend_list':
        this.eventHandlers.onFriendList?.(message as FriendListResponseMessage);
        break;
      case 'user_status':
        this.eventHandlers.onUserStatus?.(message as UserStatusMessage);
        break;
      case 'room_state':
        this.eventHandlers.onRoomState?.(message as RoomStateMessage);
        break;
      case 'ping':
        this.sendPong();
        break;
      case 'pong':
        break;
      default:
        console.warn('Unknown message type:', (message as any).type);
    }
  }

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, 30000);
  }

  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private async attemptReconnect(): Promise<void> {
    this.reconnectAttempts++;

    try {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.connect();
    } catch (error) {
      console.error('Reconnection failed:', error);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => this.attemptReconnect(), this.reconnectDelay);
      } else {
        this.connectionStatus = 'error';
      }
    }
  }

  addEventHandlers(handlers: Partial<WebSocketEventHandlers>): void {
    if (Object.keys(handlers).length === 0) {
      this.eventHandlers = {};
    } else {
      this.eventHandlers = { ...this.eventHandlers, ...handlers };
    }
  }

  public handleAuthFailure(): void {
    this.addEventHandlers({});
    this.disconnect();
    const user = useAuth.getState().user;
    if (!user) {
      return;
    }
    alert('Service connection error, will be redirected to home page');
    window.location.href = '/';
  }
}

export const websocketService = new WebSocketService();
