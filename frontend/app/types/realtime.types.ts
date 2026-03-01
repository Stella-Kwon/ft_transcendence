// Base message structure (given from backend)
export interface BaseMessage {
  id: string;
  timestamp: number;
  version: string;
}

// Chat message payload (= backend ChatMessagePayload)
export interface ChatMessagePayload {
  roomId?: string;
  userId: string;
  name: string;
  content: string;
  messageType?: 'text' | 'image' | 'file';
  originalFilename?: string;
  mimeType?: string;
  fileSize?: number;
}

// Chat message (= backend ChatMessage )
export interface ChatMessage extends BaseMessage {
  type: 'chat';
  payload: ChatMessagePayload;
}


// Room member (= backend RoomMemberDto )
export interface RoomMember {
  userId: string;
  name: string;
  joinedAt: number;
  isOnline: boolean;
}

// Room (= backend RoomCreatedPayload )
export interface Room {
  id: string;
  name: string;
  masterId: string;
  description?: string;
  isPrivate: boolean;
  maxUsers: number;
  memberCount: number;
  createdAt: number;
  updatedAt: number;
}

// Room state message payload (= backend roomStatePayloadSchema )
export interface RoomStatePayload {
  room: Room;
  previousMessages: Array<{
    id: string;
    content: string;
    userId: string;
    userName: string;
    messageType: string;
    timestamp: number;
    isRead: boolean;
  }>;
  unreadMessages: Array<{
    id: string;
    content: string;
    userId: string;
    userName: string;
    messageType: string;
    timestamp: number;
    isRead: boolean;
  }>;
  members: RoomMember[];
  readState: {
    lastReadTimestamp: number;
    unreadCount: number;
    totalMessages: number;
  };
}

// Room state message (= backend roomStateMessageSchema )
export interface RoomStateMessage extends BaseMessage {
  type: 'room_state';
  payload: RoomStatePayload;
}

// Friend (= backend friendListResponsePayloadSchema의 friends arr elements)
export interface Friend {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  isOnline: boolean;
  lastSeen: number;
}

// Friend request (= backend FriendPendingRequestPayloadSchema )
export interface FriendRequest {
  id: string;
  requesterName: string;
  requesterId: string;
  requesterEmail: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
}

// Friend request payload (= backend FriendRequestPayloadSchema )
export interface FriendRequestPayload {
  requesterId: string;
  requesterName: string;
  addresseeId: string;
  addresseeEmail: string;
  addresseeName: string;
  message?: string;
  createdAt: number;
}

// Friend request message (= backend FriendRequestSchema )
export interface FriendRequestMessage extends BaseMessage {
  type: 'friend_request';
  payload: FriendRequestPayload;
}

// Friend request response payload (= backend FriendRequestResponsePayloadSchema )
export interface FriendRequestResponsePayload {
  requestId: string;
  requesterId: string;
  requesterName: string;
  addresseeId: string;
  addresseeName: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  acceptedAt?: number;
}

// Friend request response message (= backend FriendRequestResponseSchema )
export interface FriendRequestResponseMessage extends BaseMessage {
  type: 'friend_request_response';
  payload: FriendRequestResponsePayload;
}

// Friend list response payload (= backend FriendListResponsePayloadSchema )
export interface FriendListResponsePayload {
  friends: Friend[];
  totalCount: number;
  updateReason?: 'friend_request_accepted' | 'friend_blocked' | 'friend_unblocked' | 'friend_removed';
  targetUserIds?: string[];
}

// Friend list response message (= backend FriendListResponseSchema )
export interface FriendListResponseMessage extends BaseMessage {
  type: 'friend_list';
  payload: FriendListResponsePayload;
}

// Error payload (= backend error.schema.ts )
export interface ErrorPayload {
  code: string;
  message: string;
  details?: any;
}

// Error message (= backend ErrorMessage )
export interface ErrorMessage extends BaseMessage {
  type: 'error';
  payload: ErrorPayload;
}

// Ping message (= backend PingMessage )
export interface PingMessage extends BaseMessage {
  type: 'ping';
}

// Pong payload (= backend PongPayload )
export interface PongPayload {
  latency?: number;
}

// Pong message (= backend PongMessage )
export interface PongMessage extends BaseMessage {
  type: 'pong';
  payload: PongPayload;
}

// Unread count payload (= backend UnreadCount )
export interface UnreadCountPayload {
  roomId: string;
  unreadCount: number;
}

// Unread count message (= backend UnreadCountMessage )
export interface UnreadCountMessage extends BaseMessage {
  type: 'unread_count';
  payload: UnreadCountPayload;
}

// Room joined payload (= backend RoomJoinedPayload )
export interface RoomJoinedPayload {
  roomId: string;
  roomName: string;
  inviterName: string;
  newMemberName: string;
}

// Room joined message (= backend RoomJoinedMessage )
export interface RoomJoinedMessage extends BaseMessage {
  type: 'room_joined';
  payload: RoomJoinedPayload;
}

// Leave room payload (= backend LeaveRoomPayload )
export interface LeaveRoomPayload {
  roomId: string;
  userId: string;
  name: string;
}

// Leave room message (= backend LeaveRoomMessage )
export interface LeaveRoomMessage extends BaseMessage {
  type: 'leave_room';
  payload: LeaveRoomPayload;
}

// User status (online/offline) message
export interface UserStatusPayload {
  userId: string;
  isOnline: boolean;
}
export interface UserStatusMessage extends BaseMessage {
  type: 'user_status';
  payload: UserStatusPayload;
}

// Mark read payload
export interface MarkReadPayload {
  roomId: string;
  lastReadTimestamp: number;
}

// Mark read message
export interface MarkReadMessage extends BaseMessage {
  type: 'mark_read';
  payload: MarkReadPayload;
}

// Connection status
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

// Room invitation message
export interface RoomInvitationMessage extends BaseMessage {
  type: 'room_invitation';
  payload: {
    roomId: string;
    roomName: string;
    inviterName: string;
    message: string;
  };
}

// WebSocket event handlers
export interface WebSocketEventHandlers {
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (error: any) => void;
  onChatMessage?: (message: ChatMessage) => void;
  onRoomJoined?: (message: RoomJoinedMessage) => void;
  onRoomInvitation?: (message: RoomInvitationMessage) => void;
  onLeaveRoom?: (message: LeaveRoomMessage) => void;
  onReconnect?: () => void;
  onUnreadCount?: (message: UnreadCountMessage) => void;
  onFriendRequest?: (message: FriendRequestMessage) => void;
  onFriendRequestResponse?: (message: FriendRequestResponseMessage) => void;
  onFriendList?: (message: FriendListResponseMessage) => void;
  onErrorMessage?: (message: ErrorMessage) => void;
  onUserStatus?: (message: UserStatusMessage) => void;
  onRoomState?: (message: RoomStateMessage) => void;
}

// Union type for all messages
export type AnyMessage = 
  | ChatMessage
  | RoomStateMessage
  | RoomJoinedMessage
  | LeaveRoomMessage
  | UnreadCountMessage
  | FriendRequestMessage
  | FriendRequestResponseMessage
  | FriendListResponseMessage
  | ErrorMessage
  | PingMessage
  | PongMessage
  | UserStatusMessage
  | MarkReadMessage; 
