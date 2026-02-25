import { FastifyPluginAsync } from "fastify";
import { Type } from '@sinclair/typebox';

import { 
  RoomCreatedPayload, 
  roomCreatedPayloadSchema,
  roomCreationRequestSchema,
  roomMemberDtoSchema,
  roomInvitationRequestSchema,
  LeaveRoomMessage,
  RoomJoinedMessage
} from './dto/room.schema';
import { chatMessageSchema } from './dto/chat.schema';

// Import simplified error response from common
import { ErrorResponseDtoSchema } from "../../common/dto/error-response";
import { UnauthorizedException } from "../../common/exceptions/UnauthorizedException";
import { NotFoundException } from "../../common/exceptions/NotFoundException";
import { ForbiddenException } from "../../common/exceptions/ForbiddenException";
import { BadRequestException } from "../../common/exceptions/BadRequestException";
import { InternalServerErrorException } from "../../common/exceptions/InternalServerErrorException";
import { SyncService } from './sync.service';
import { EventService } from './event.service';

declare module 'fastify' {
  interface FastifyInstance {
    syncService: SyncService;
    eventService: EventService;
  }
}
export const roomController: FastifyPluginAsync = async (fastify, opts) => {
  // Create a new room
  fastify.post("/rooms", {
    schema: {
      body: roomCreationRequestSchema,
      response: {
        201: roomCreatedPayloadSchema,
        400: ErrorResponseDtoSchema,
        401: ErrorResponseDtoSchema,
      }
    }
  }, async (request, reply) => {
    const roomData = request.body as any;
    const userId = (request.user as any)?.id;

    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    const room = await fastify.roomService.createRoom(
      request.entityManager,
      roomData.name,
      userId,
      roomData.description,
      roomData.isPrivate,
      roomData.maxUsers
    );

    const roomResponse: RoomCreatedPayload = {
      id: room.id,
      name: room.name,
      masterId: room.masterId,
      description: room.description,
      isPrivate: room.isPrivate,
      memberCount: room.members?.length || 1,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt.getTime(),
      updatedAt: room.updatedAt.getTime()
    };

    return reply.code(201).send(roomResponse);
  });

  // Get room by ID
  fastify.get("/rooms/:roomId", {
    schema: {
      params: Type.Object({
        roomId: Type.String()
      }),
      response: {
        200: roomCreatedPayloadSchema,
        404: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    const { roomId } = request.params as { roomId: string };
    const room = await fastify.roomService.getRoom(request.entityManager, roomId);
    
    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const roomResponse: RoomCreatedPayload = {
      id: room.id,
      name: room.name,
      masterId: room.masterId,
      description: room.description,
      isPrivate: room.isPrivate,
      memberCount: room.members?.length || 0,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt.getTime(),
      updatedAt: room.updatedAt.getTime()
    };

    return reply.send(roomResponse);
  });

  // Join room with message sync
  fastify.post("/rooms/:roomId/join", {
    schema: {
      params: Type.Object({
        roomId: Type.String()
      }),
              response: {
          200: Type.Object({
            room: roomCreatedPayloadSchema,
            messages: Type.Array(chatMessageSchema),
            unreadCount: Type.Number()
          }),
          401: ErrorResponseDtoSchema,
          404: ErrorResponseDtoSchema
        }
    }
  }, async (request, reply) => {
    const userId = (request.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    const { roomId } = request.params as { roomId: string };
    const em = request.entityManager.fork();

    const isInRoom = await fastify.roomService.isUserInRoomDatabase(em, roomId, userId);
    if (!isInRoom) {
      throw new ForbiddenException("You are not a member of this room. Please request an invitation first.");
    }

    // Sync room messages
    const roomData = await fastify.syncService.syncRoomMessages(em, userId, roomId);
    
    const room = await fastify.roomService.getRoom(em, roomId);
    if (!room) {
      throw new NotFoundException("Room not found");
    }
    
    const roomResponse: RoomCreatedPayload = {
      id: room.id,
      name: room.name,
      masterId: room.masterId,
      description: room.description,
      isPrivate: room.isPrivate,
      memberCount: room.members?.length || 0,
      maxUsers: room.maxUsers,
      createdAt: room.createdAt.getTime(),
      updatedAt: room.updatedAt.getTime()
    };

    return reply.send({
      room: roomResponse,
      messages: [...roomData.previousMessages, ...roomData.unreadMessages],
      unreadCount: roomData.unreadMessages.length
    });
  });

//get a roomlist
fastify.get("/rooms/:userId/roomlist", {
    schema: {
      params: Type.Object({
        userId: Type.String()
      }),
      response: {
        200: Type.Object({
          roomList: Type.Array(Type.Intersect([
            roomCreatedPayloadSchema,
            Type.Object({
              unreadCount: Type.Number()
            })
          ])),
        }),
        404: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      const em = request.entityManager.fork();
      const { userId } = request.params as { userId: string };
      const currentUserId = (request.user as any)?.id;
      
      if (!currentUserId) {
        throw new UnauthorizedException("Authentication required");
      }
      if (currentUserId !== userId) {
        throw new ForbiddenException("Access denied: You can only view your own room list");
      }
      const dbRooms = await fastify.roomService.getUserRooms(em, userId);
      const rooms = dbRooms.map(room => room.id);
      const roomList = await Promise.all(rooms.map(async (roomId: string) => {
        const room = await fastify.roomService.getRoom(em, roomId);
        if (!room) return null;
        const memberCount = room.members?.length || 0;
        const unreadCount = await fastify.syncService.getUnreadMessageCount(em, userId, roomId);
        return {
          id: room.id,
          name: room.name,
          masterId: room.masterId,
          description: room.description,
          isPrivate: room.isPrivate,
          maxUsers: room.maxUsers,
          memberCount: memberCount,
          unreadCount: unreadCount,
          createdAt: room.createdAt.getTime(),
          updatedAt: room.updatedAt.getTime()
        };
      }));
      
      const validRoomList = roomList.filter(room => room !== null);
      
      return reply.send({
        roomList: validRoomList
      });
  } catch (error: any) {
    if (error.statusCode) {
      throw error;
    }
    console.error('Error getting room list:', error);
    throw new InternalServerErrorException('Failed to get room list');
  }
});

//invite to the room
fastify.post("/rooms/:roomId/invite", {
    schema: {
      params: Type.Object({
        roomId: Type.String()
      }),
      body: roomInvitationRequestSchema,
      response: {
        200: Type.Object({
          success: Type.Array(Type.String()),
          failed: Type.Array(Type.Object({
            name: Type.String(),
            reason: Type.String()
          })),
          message: Type.String()
        }),
        400: ErrorResponseDtoSchema,
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const { inviteeNames } = request.body as { inviteeNames: string[] };
    const userId = (request.user as any)?.id;
    const userName = (request.user as any)?.name;

    console.log('🔍 Invite request:', { roomId, inviteeNames, userId, userName });

    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    try {
      const results = await fastify.roomService.addUsersToRoomDatabase(
        request.entityManager,
        roomId,
        inviteeNames,
        userId,
        userName
      );

       const room = await fastify.roomService.getRoom(request.entityManager, roomId);
       if (room) {
         for (const invitedUserName of results.success) {
           fastify.eventService.emitRoomJoined({
             roomId,
             roomName: room.name,
             inviterName: userName,
             inviteeName: invitedUserName
           });
         }
       }

      return reply.send({
        success: results.success,
        failed: results.failed,
        message: `Invited ${results.success.length} users successfully, ${results.failed.length} failed`
      });

    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      console.error('Unexpected error in room invitation:', error);
      console.error('Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack?.split('\n')[0]
      });
      throw new BadRequestException(`Failed to invite users to room: ${error.message}`);
    }
  });

  //leave room
  fastify.post("/rooms/:roomId/leave", {
    schema: {
      params: Type.Object({
        roomId: Type.String()
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    const { roomId } = request.params as { roomId: string };
    const userId = (request.user as any)?.id;
    const userName = (request.user as any)?.name;

    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    try {
      await fastify.roomService.leaveRoom(
        request.entityManager,
        userId,
        roomId
      );

      fastify.eventService.emitLeaveRoom({
        roomId,
        userId,
        name: userName}
      );

      return reply.send({
        success: true,
        message: `${userName} successfully left the room`
      });
    } catch (error: any) {
      if (error.statusCode) {
        throw error;
      }
      console.error('Unexpected error in leave room:', error);
      throw new NotFoundException(`Failed to leave room: ${error.message}`);
    }
  });

  // Get room members
  fastify.get("/rooms/:roomId/members", {
    schema: {
      params: Type.Object({
        roomId: Type.String()
      }),
      response: {
        200: Type.Array(roomMemberDtoSchema),
        404: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    const userId = (request.user as any)?.id;
    if (!userId) {
      throw new UnauthorizedException("Authentication required");
    }

    const { roomId } = request.params as { roomId: string };
    const room = await fastify.roomService.getRoom(request.entityManager, roomId);

    if (!room) {
      throw new NotFoundException("Room not found");
    }

    const roomMembers = await fastify.roomService.getRoomMembers(request.entityManager, roomId);
    const members = roomMembers.map(member => ({
      userId: member.userId,
      name: member.name,
      joinedAt: member.joinedAt?.getTime() || Date.now(),
      isOnline: fastify.connectionService.isUserOnline(member.userId) // 🎯 동적 계산
    }));

    const onlineCount = members.filter(member => member.isOnline).length;

    return reply.send(members);
  });
}; 