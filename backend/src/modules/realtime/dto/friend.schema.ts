import { Type, Static } from '@sinclair/typebox';
import { baseMessageSchema } from './base.schema';



export const friendPendingRequestPayloadSchema = Type.Object({
  id: Type.String(),
  requesterName: Type.String(),
  requesterId: Type.String(),
  requesterEmail: Type.String(),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('accepted'),
    Type.Literal('rejected')
  ]),
  createdAt: Type.Number()
});

// request to send a friend request
export const friendRequestPayloadSchema = Type.Object({
  requesterId: Type.String(),
  requesterName: Type.String(),
  addresseeId: Type.String(),
  addresseeEmail: Type.String(),
  addresseeName: Type.String(),
  message: Type.Optional(Type.String()),
  createdAt: Type.Number()
});

export const friendRequestSchema = Type.Intersect([
  baseMessageSchema,
  Type.Object({
    type: Type.Literal('friend_request'),
    payload: friendRequestPayloadSchema
  })
]);

// response to friend request
export const friendRequestResponsePayloadSchema = Type.Object({
  requestId: Type.String(),
  requesterId: Type.String(),
  requesterName: Type.String(),
  addresseeId: Type.String(),
  addresseeName: Type.String(),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('accepted'),
    Type.Literal('rejected')
  ]),
  createdAt: Type.Number(),
  acceptedAt: Type.Optional(Type.Number())
});

export const friendRequestResponseSchema = Type.Intersect([
  baseMessageSchema,
  Type.Object({
    type: Type.Literal('friend_request_response'),
    payload: friendRequestResponsePayloadSchema
  })
]);

// Friend list response
export const friendListResponsePayloadSchema = Type.Object({
  friends: Type.Array(Type.Object({
    id: Type.String(),
    name: Type.String(),
    email: Type.String(),
    avatarUrl: Type.String(),
    isOnline: Type.Boolean(),
    lastSeen: Type.Optional(Type.Number())
  })),
  totalCount: Type.Number(),
  updateReason: Type.Optional(Type.Union([
    Type.Literal('friend_request_accepted'),
    Type.Literal('friend_blocked'),
    Type.Literal('friend_unblocked'),
    Type.Literal('friend_removed')
  ])),
  targetUserIds: Type.Optional(Type.Array(Type.String()))//use in eventlistener
});

export const friendListResponseSchema = Type.Intersect([
  baseMessageSchema,
  Type.Object({
    type: Type.Literal('friend_list'),
    payload: friendListResponsePayloadSchema
  })
]);



// Type exports
export type FriendPendingRequestPayloadSchema = Static<typeof friendPendingRequestPayloadSchema>;
export type FriendRequestPayloadSchema = Static<typeof friendRequestPayloadSchema>;
export type FriendRequestSchema = Static<typeof friendRequestSchema>;
export type FriendRequestResponsePayloadSchema = Static<typeof friendRequestResponsePayloadSchema>;
export type FriendRequestResponseSchema = Static<typeof friendRequestResponseSchema>;
export type FriendListResponsePayloadSchema = Static<typeof friendListResponsePayloadSchema>;
export type FriendListResponseSchema = Static<typeof friendListResponseSchema>;

