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

// WebSocket 클라이언트 → 서버 메시지 스키마 (실제로 받는 것들만)
export const messageSchema = Type.Union([
  chatMessageSchema,        // 실시간 채팅
  roomStateMessageSchema,   // 룸 상태 동기화 요청
  leaveRoomMessageSchema,   // 룸 나가기 요청
  markReadMessageSchema,    // 메시지 읽음 처리
  pingMessageSchema,        // 연결 상태 확인
  pongMessageSchema,        // ping 응답
  errorMessageSchema,       // 에러 메시지
]);

// 서버 → 클라이언트 알림 스키마 (EventListenerService에서 사용)
export const notificationSchema = Type.Union([
  friendRequestSchema,      // 친구 요청 알림
  friendRequestResponseSchema, // 친구 요청 응답 알림
  friendListResponseSchema, // 친구 목록 업데이트
  roomJoinedMessageSchema,  // 룸 참여 알림
  roomStateMessageSchema,   // 룸 상태 동기화
  unreadCountMessageSchema, // 읽지 않은 메시지 수 업데이트
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