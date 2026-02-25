import { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { Static, Type } from "@sinclair/typebox";
import { 
  friendRequestResponseSchema,
  friendListResponseSchema,
  friendPendingRequestPayloadSchema
} from "./dto/friend.schema";
import { ErrorResponseDtoSchema } from "../../common/dto/error-response";
import { InternalServerErrorException } from "../../common/exceptions/InternalServerErrorException";
import { UnauthorizedException } from "../../common/exceptions/UnauthorizedException";
import { NotFoundException } from "../../common/exceptions/NotFoundException";
import { BadRequestException } from "../../common/exceptions/BadRequestException";

async function loginCheck(request: FastifyRequest) {
  const currentUserId = (request.user as any)?.id;
  if (!currentUserId) {
    throw new UnauthorizedException("User not authenticated, please login again");
  }
  return currentUserId;
}

export const friendshipController: FastifyPluginAsync = async (fastify) => {

  //send friend request
  fastify.post('/friends/requests/:addresseeEmail', {
    schema: {
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        400: ErrorResponseDtoSchema,
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      },
      params: Type.Object({
        addresseeEmail: Type.String()
      })
    }
  }, async (request, reply) => {
    try {
      const currentUserId = await loginCheck(request);

      const { addresseeEmail } = request.params as { addresseeEmail: string };
      await fastify.friendshipService.sendFriendRequest(
        request.entityManager,
        currentUserId,
        addresseeEmail
      );

      return reply.send({
        success: true,
        message: `Friend request sent to ${addresseeEmail} successfully`
      });
    } catch (error: any) {
      console.error('Error sending friend request:', error);
      if (error.message === 'User not authenticated, please login again') {
        throw new UnauthorizedException('User not authenticated, please login again');
      }
      if (error.message === 'User with this email not found') {
        throw new NotFoundException('User with this email not found');
      }
      if (error.message === 'Cannot send friend request to yourself') {
        throw new BadRequestException('Cannot send friend request to yourself');
      }
      if (error.message === 'You are already friends with this user') {
        throw new BadRequestException('You are already friends with this user');
      }
      if (error.message === 'Friend request already exists') {
        throw new BadRequestException('Friend request already exists');
      }
      throw new InternalServerErrorException('Failed to send friend request');
    }
  });

  // Accept friend request
  fastify.post('/friends/requests/:requestId/accept', {
    schema: {
      params: Type.Object({
        requestId: Type.String() //requestId itself not the user      
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema

      }
    }
  }, async (request, reply) => {

    try{
    const currentUserId = await loginCheck(request);
    const { requestId } = request.params as { requestId: string };

    await fastify.friendshipService.acceptFriendRequest(
      request.entityManager,
      requestId,
      currentUserId
      );
      
       return reply.send({
         success: true,
         message: 'Friend request accepted successfully'
       });
    }
    catch (error: any) {
      console.error('Error accepting friend request:', error);
      if (error.message === 'Friend request not found or already processed') {
        throw new NotFoundException('Friend request not found or already processed');
      }
      if (error.message === 'User or friend not found') {
        throw new NotFoundException('User or friend not found');
      }
      throw new InternalServerErrorException('Failed to accept friend request');
    }
   
  });

  
  // Reject friend request
  fastify.post('/friends/requests/:requestId/reject', {
    schema: {
      params: Type.Object({
        requestId: Type.String()
      }),
      response: {
        200: Type.Object({
          message: Type.String(),
          requestId: Type.String()
        }),
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
    const currentUserId = await loginCheck(request);
    const { requestId } = request.params as { requestId: string };

    await fastify.friendshipService.rejectFriendRequest(
      request.entityManager,
      requestId,
      currentUserId
    );
    
    return reply.send({
      message: `Friend request rejected`,
      requestId
    });
  } catch (error: any) {
    console.error('Error rejecting friend request:', error);
    if (error.message === 'Friend request not found or already processed') {
      throw new NotFoundException('Friend request not found or already processed');
    }
    throw new InternalServerErrorException('Failed to reject friend request');
  }
  });

  // Get pending friend requests list (HTTP API - 앱 시작 시 조회)
  fastify.get('/friends/requests', {
    schema: {
      response: {
        200: Type.Array(friendPendingRequestPayloadSchema),
        401: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try{
      const currentUserId = await loginCheck(request);
    const requests = await fastify.friendshipService.getPendingRequests(
      request.entityManager,
      currentUserId
    );
    return reply.send(requests);
  } catch (error: any) {
    console.error('Error getting pending friend requests:', error);
    if (error.message === 'User not authenticated, please login again') {
      throw new UnauthorizedException('User not authenticated, please login again');
    }
    throw new InternalServerErrorException('Failed to get pending friend requests');
  }
  });

  // Get friends list (HTTP API - 앱 시작 시 조회)
  fastify.get('/friends', {
    schema: {
      response: {
        200: friendListResponseSchema,
        401: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try{
    const currentUserId = await loginCheck(request);
    
    const friends = await fastify.friendshipService.getFriendsList(
      request.entityManager,
      currentUserId
    );
    
    return reply.send(friends);
  } 
  catch (error: any) {
    console.error('Error getting friends list:', error);
    if (error.message === 'User not authenticated, please login again') {
      throw new UnauthorizedException('User not authenticated, please login again');
    }
    throw new InternalServerErrorException('Failed to get friends list');
  }
  });

  fastify.get('/friends/blocked', {
    schema: {
      response: {
        200: friendListResponseSchema,
        401: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      const currentUserId = await loginCheck(request);
      
      const blockedFriends = await fastify.friendshipService.getBlockedFriendsList(
        request.entityManager,
        currentUserId
      );
      
      return reply.send(blockedFriends);
    } catch (error: any) {
      console.error('Error getting blocked friends list:', error);
      if (error.message === 'User not authenticated, please login again') {
        throw new UnauthorizedException('User not authenticated, please login again');
      }
      throw new InternalServerErrorException('Failed to get blocked friends list');
    }
  });

  // 🎯 친구 블록 기능
  fastify.post('/friends/:friendId/block', {
    schema: {
      params: Type.Object({
        friendId: Type.String()
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        400: ErrorResponseDtoSchema,
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      const currentUserId = await loginCheck(request);
      const { friendId } = request.params as { friendId: string };
      
      await fastify.friendshipService.blockFriend(
        request.entityManager,
        currentUserId,
        friendId
      );
      
      return reply.send({
        success: true,
        message: `Friend blocked successfully`
      });
    } catch (error: any) {
      console.error('Error blocking friend:', error);
      if (error.message === 'You can only block existing friends') {
        throw new BadRequestException(error.message);
      }
      if (error.message === 'Friendship not found') {
        throw new NotFoundException('Friendship not found');
      }
      throw new InternalServerErrorException('Failed to block friend');
    }
  });

  // 🎯 친구 블록 해제 기능
  fastify.post('/friends/:friendId/unblock', {
    schema: {
      params: Type.Object({
        friendId: Type.String()
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      const currentUserId = await loginCheck(request);
      const { friendId } = request.params as { friendId: string };

      await fastify.friendshipService.unblockFriend(
        request.entityManager,
        currentUserId,
        friendId
      );
      
      return reply.send({
        success: true,
        message: `Friend unblocked successfully`
      });
    } catch (error: any) {
      console.error('Error unblocking friend:', error);
      if (error.message === 'Blocked friendship not found') {
        throw new NotFoundException('Blocked friendship not found');
      }
      throw new InternalServerErrorException('Failed to unblock friend');
    }
  });

  // Remove friend
  fastify.delete('/friends/:friendId', {
    schema: {
      params: Type.Object({
        friendId: Type.String()
      }),
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          message: Type.String()
        }),
        401: ErrorResponseDtoSchema,
        404: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try{
    const currentUserId = await loginCheck(request);
    const { friendId } = request.params as { friendId: string };
    
    await fastify.friendshipService.removeFriend(
      request.entityManager,
      currentUserId,
      friendId
    );
    
    return reply.send({
      success: true,
      message: `Friend removed successfully`
    });
  } catch (error: any) {
    console.error('Error removing friend:', error);
    if (error.message === 'Friendship not found') {
      throw new NotFoundException('Friendship not found');
    }
    throw new InternalServerErrorException('Failed to remove friend');
  }
  });

  //list of online friends
  fastify.get('/friends/online', {
    schema: {
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          friends: Type.Array(Type.Object({
            id: Type.String(),
            name: Type.String(),
            email: Type.String(),
            isOnline: Type.Boolean(),
            connectedAt: Type.Optional(Type.Number())
          })),
          totalFriends: Type.Number(),
          onlineFriends: Type.Number()
        }),
        401: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      const currentUserId = await loginCheck(request);
  
      const friendsListResponse = await fastify.friendshipService.getFriendsList(
        request.entityManager,
        currentUserId
      );

      const friendsWithStatus = friendsListResponse.payload.friends
        .map((friend: any) => {
          const isOnline = fastify.connectionService.isUserOnline(friend.id);
          const userConnection = fastify.connectionService.getConnectionByUserId(friend.id);
          
          return {
            id: friend.id,
            name: friend.name,
            email: friend.email,
            isOnline,
            connectedAt: isOnline && userConnection ? new Date(userConnection.connectedAt).getTime() : undefined
          };
        });

      const onlineFriendsCount = friendsWithStatus.filter(friend => friend.isOnline).length;
      
      return reply.send({
        success: true,
        friends: friendsWithStatus, // 모든 친구 반환 (상태 포함)
        totalFriends: friendsWithStatus.length,
        onlineFriends: onlineFriendsCount
      });
    } catch (error: any) {
      console.error('Error getting online friends:', error);
      throw new InternalServerErrorException('Failed to get online friends');
    }
  });

  fastify.get('/users/online', {
    schema: {
      response: {
        200: Type.Object({
          success: Type.Boolean(),
          onlineUsers: Type.Array(Type.Object({
            userId: Type.String(),
            name: Type.String(),
            email: Type.String(),
            connectedAt: Type.Number()
          }))
        }),
        401: ErrorResponseDtoSchema,
        500: ErrorResponseDtoSchema
      }
    }
  }, async (request, reply) => {
    try {
      await loginCheck(request);
      
      const onlineUsers = fastify.connectionService.getOnlineUsers().map(connection => ({
        userId: connection.userId,
        name: connection.name,
        email: connection.email,
        connectedAt: connection.connectedAt ? new Date(connection.connectedAt).toISOString() : undefined
      }));
      
      return reply.send({
        success: true,
        onlineUsers
      });
    } catch (error: any) {
      console.error('Error getting online users:', error);
      throw new InternalServerErrorException('Failed to get online users');
    }
  });
}; 