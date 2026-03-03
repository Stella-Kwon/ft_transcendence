// Re-export all schemas for easy access
export * from './base.schema';
export * from './chat.schema';
export * from './room.schema';
export * from './sync.schema';
export * from './error.schema';
export * from './ping.schema';
export * from './friend.schema';

// Message union type
import { Type, Static } from '@sinclair/typebox';

import { errorMessageSchema, type ErrorMessage } from './error.schema';
import { pingMessageSchema, pongMessageSchema, type PingMessage, type PongMessage } from './ping.schema';
import { chatMessageSchema, type ChatMessage} from './chat.schema';
import { unreadCountMessageSchema, type UnreadCountMessage } from './sync.schema';
import { markReadMessageSchema, type MarkReadMessage } from './mark-read.schema';
import {
  roomJoinedMessageSchema,
  roomStateMessageSchema,
  leaveRoomMessageSchema,
  type RoomJoinedMessage,
  type RoomStateMessage,
  type LeaveRoomMessage
} from './room.schema';
import {
  friendRequestSchema,
  friendRequestResponseSchema,
  friendListResponseSchema,
  type FriendRequestSchema,
  type FriendRequestResponseSchema,
  type FriendListResponseSchema,
  type FriendPendingRequestPayloadSchema
} from './friend.schema';


export const messageSchema = Type.Union([
  chatMessageSchema,
  roomStateMessageSchema,
  leaveRoomMessageSchema,
  markReadMessageSchema,
  pingMessageSchema,
  pongMessageSchema,
  errorMessageSchema,
]);


export const notificationSchema = Type.Union([
  friendRequestSchema, 
  friendRequestResponseSchema,
  friendListResponseSchema,
  roomJoinedMessageSchema,
  roomStateMessageSchema,
  unreadCountMessageSchema,
]);

export type AnyMessage = Static<typeof messageSchema>;
export type NotificationMessage = Static<typeof notificationSchema>;

export type {
  ErrorMessage,
  PingMessage,
  PongMessage,
  ChatMessage,
  UnreadCountMessage,
  MarkReadMessage,
  RoomJoinedMessage,
  LeaveRoomMessage,
  RoomStateMessage,
  FriendRequestSchema,
  FriendRequestResponseSchema,
  FriendListResponseSchema,
  FriendPendingRequestPayloadSchema
}; 