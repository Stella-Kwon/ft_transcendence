import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { User } from "../user/entities/user.entity";
import { Friendship } from "./entities/friendship.entity";
import { FriendRequest } from "./entities/friendship.entity";
import { ConnectionService } from "./connection.service";
import { EventService } from "./event.service";
import { NotFoundException } from "../../common/exceptions/NotFoundException";
import { BadRequestException } from "../../common/exceptions/BadRequestException";
import { FriendListResponseSchema, FriendPendingRequestPayloadSchema } from "./dto";

export class FriendshipService {
  constructor(
    private connectionService: ConnectionService,
    private eventService: EventService
  ) {}

  // Send friend request
  async sendFriendRequest(em: EntityManager, requesterId: string, addresseeEmail: string): Promise<void> {
    const requester = await em.findOne(User, { id: requesterId });
    const addressee = await em.findOne(User, { email: addresseeEmail });

    if (!requester) {
      throw new NotFoundException('Requester not found');
    }

    if (!addressee) {
      throw new NotFoundException('User with this email not found');
    }

    if (requester.id === addressee.id) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check if they are already friends
    const existingFriendship = await em.findOne(Friendship, {
      $or: [
        { user: requester, friend: addressee, status: 'active' },
        { user: addressee, friend: requester, status: 'active' }
      ]
    });

    if (existingFriendship) {
      throw new BadRequestException('You are already friends with this user');
    }

    // Check if friend request already exists
    const existingRequest = await em.findOne(FriendRequest, {
      $or: [
        { requester: requester, addressee: addressee, status: 'pending' },
        { requester: addressee, addressee: requester, status: 'pending' }
      ]
    });

    if (existingRequest) {
      throw new BadRequestException('Friend request already exists');
    }

    const friendRequest = em.create(FriendRequest, {
      id: randomUUID(),
      requester,
      addressee,
      status: 'pending',
      createdAt: new Date()
    });

    await em.persistAndFlush(friendRequest);

    this.eventService.emitFriendRequest({
      requesterId: requester.id,
      requesterName: requester.name,
      addresseeId: addressee.id,
      addresseeEmail: addressee.email,
      addresseeName: addressee.name,
      message: `${requester.name} sent you a friend request`,
      createdAt: Date.now()
    });
  }

  async CreateFriendship(em: EntityManager, userId: string, friendId: string): Promise<Friendship> {
    if (userId === friendId) {
      throw new BadRequestException('Cannot create friendship with yourself');
    }

    const friendship = await em.findOne(Friendship, {
      user: { id: userId },
      friend: { id: friendId },
      status: 'active'
    });

    if (!friendship) {
      const user = await em.findOne(User, { id: userId });
      const friend = await em.findOne(User, { id: friendId });

      if (!user || !friend) {
        throw new NotFoundException('User or friend not found');
      }

      const newFriendship = em.create(Friendship, {
        id: randomUUID(),
        user: user,
        friend: friend,
        status: 'active',
        createdAt: new Date()
      });
      await em.persistAndFlush(newFriendship);
      return newFriendship;
    }
    return friendship;
  }

  // Accept friend request
  async acceptFriendRequest(em: EntityManager, requestId: string, addresseeId: string): Promise<void> {
    const friendRequest = await em.findOne(FriendRequest, {
      id: requestId,
      addressee: { id: addresseeId },
      status: 'pending'
    }, { populate: ['requester', 'addressee'] });

    if (!friendRequest) {
      throw new Error('Friend request not found or already processed');
    }

    friendRequest.status = 'accepted';
    friendRequest.acceptedAt = new Date();

    const existingFriendship1 = await em.findOne(Friendship, {
      user: { id: friendRequest.requester.id },
      friend: { id: friendRequest.addressee.id },
      status: 'active'
    });

    const existingFriendship2 = await em.findOne(Friendship, {
      user: { id: friendRequest.addressee.id },
      friend: { id: friendRequest.requester.id },
      status: 'active'
    });

    if (existingFriendship1 || existingFriendship2) {
      throw new BadRequestException('Friendship already exists');
    }

    const friendship1 = await this.CreateFriendship(em, friendRequest.requester.id, friendRequest.addressee.id);
    const friendship2 = await this.CreateFriendship(em, friendRequest.addressee.id, friendRequest.requester.id);

    await em.persistAndFlush([friendRequest, friendship1, friendship2]);

    this.eventService.emitFriendRequestResponse({
      requestId: friendRequest.id,
      requesterId: friendRequest.requester.id,
      requesterName: friendRequest.requester.name,
      addresseeId: friendRequest.addressee.id,
      addresseeName: friendRequest.addressee.name,
      status: 'accepted',
      createdAt: friendRequest.createdAt.getTime()
    });

    this.eventService.emitUpdateFriendList({
      updateReason: 'friend_request_accepted',
      friends: [],
      totalCount: 0,
      targetUserIds: [friendRequest.requester.id, friendRequest.addressee.id]
    });
  }

  // Reject friend request
  async rejectFriendRequest(em: EntityManager, requestId: string, userId: string): Promise<void> {
    const friendRequest = await em.findOne(FriendRequest, {
      id: requestId,
      addressee: { id: userId },
      status: 'pending'
    }, { populate: ['requester', 'addressee'] });

    if (!friendRequest) {
      throw new NotFoundException('Friend request not found or already processed');
    }

    friendRequest.status = 'rejected';
    await em.persistAndFlush(friendRequest);

    this.eventService.emitFriendRequestResponse({
      requestId: friendRequest.id,
      requesterId: friendRequest.requester.id,
      requesterName: friendRequest.requester.name,
      addresseeId: friendRequest.addressee.id,
      addresseeName: friendRequest.addressee.name,
      status: 'rejected',
      createdAt: friendRequest.createdAt.getTime()
    });
  }

  async blockFriend(em: EntityManager, userId: string, friendId: string): Promise<void> {
    const friendship1 = await em.findOne(Friendship, {
      user: { id: userId },
      friend: { id: friendId },
      status: 'active'
    });

    const friendship2 = await em.findOne(Friendship, {
      user: { id: friendId },
      friend: { id: userId },
      status: 'active'
    });

    if (!friendship1 || !friendship2) {
      throw new NotFoundException('Friendship not found');
    }

    friendship1.status = 'blocked';
    friendship2.status = 'blocked';

    await em.persistAndFlush([friendship1, friendship2]);

    this.eventService.emitUpdateFriendList({
      updateReason: 'friend_blocked',
      friends: [],
      totalCount: 0,
      targetUserIds: [userId, friendId]
    });
  }

  async unblockFriend(em: EntityManager, userId: string, friendId: string): Promise<void> {
    const friendship1 = await em.findOne(Friendship, {
      user: { id: userId },
      friend: { id: friendId },
      status: 'blocked'
    });

    const friendship2 = await em.findOne(Friendship, {
      user: { id: friendId },
      friend: { id: userId },
      status: 'blocked'
    });

    if (!friendship1 || !friendship2) {
      throw new NotFoundException('Blocked friendship not found');
    }

    friendship1.status = 'active';
    friendship2.status = 'active';

    await em.persistAndFlush([friendship1, friendship2]);

    this.eventService.emitUpdateFriendList({
      updateReason: 'friend_unblocked',
      friends: [],
      totalCount: 0,
      targetUserIds: [userId, friendId]
    });
  }

  // Get pending friend requests for a user
  async getPendingRequests(em: EntityManager, userId: string): Promise<FriendPendingRequestPayloadSchema[]> {
    const friendRequests = await em.find(FriendRequest, {
      addressee: { id: userId },
      status: 'pending'
    }, { populate: ['requester', 'addressee'] });

    return friendRequests.map(request => ({
      id: request.id,
      requesterName: request.requester.name,
      requesterId: request.requester.id,
      requesterEmail: request.requester.email,
      status: request.status,
      createdAt: request.createdAt.getTime()
    }));
  }

  // Get user's friends list with online status
  async getFriendsList(em: EntityManager, userId: string, updateReason?: 'friend_request_accepted' | 'friend_blocked' | 'friend_unblocked' | 'friend_removed'): Promise<FriendListResponseSchema> {
    const friendships = await em.find(Friendship, {
      user: { id: userId },
      status: 'active'
    }, { populate: ['friend'] });

    const friendslist = friendships.map(friendship => {
      const friend = friendship.friend;
      const isOnline = this.connectionService.isUserOnline(friend.id);
      const userConnection = this.connectionService.getConnectionByUserId(friend.id);

      return {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        avatarUrl: friend.avatarUrl || '',
        isOnline,
        lastSeen: userConnection ? new Date(userConnection.connectedAt).getTime() : Date.now()
      };
    });

    const friendsList: FriendListResponseSchema = {
      id: randomUUID(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'friend_list',
      payload: {
        friends: friendslist,
        totalCount: friendslist.length,
        updateReason: updateReason
      }
    };
    return friendsList;
  }

  // Get blocked friends list
  async getBlockedFriendsList(em: EntityManager, userId: string, updateReason?: 'friend_request_accepted' | 'friend_blocked' | 'friend_unblocked' | 'friend_removed'): Promise<FriendListResponseSchema> {
    const blockedFriendships = await em.find(Friendship, {
      user: { id: userId },
      status: 'blocked'
    }, { populate: ['friend'] });

    const blockedFriendslist = blockedFriendships.map(friendship => {
      const friend = friendship.friend;

      return {
        id: friend.id,
        name: friend.name,
        email: friend.email,
        avatarUrl: friend.avatarUrl || '',
        isOnline: false,
        lastSeen: Date.now()
      };
    });

    const blockedFriendsList: FriendListResponseSchema = {
      id: randomUUID(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'friend_list',
      payload: {
        friends: blockedFriendslist,
        totalCount: blockedFriendslist.length,
        updateReason: updateReason
      }
    };
    return blockedFriendsList;
  }

  // Remove friend
  async removeFriend(em: EntityManager, userId: string, friendId: string): Promise<void> {
    const friendships = await em.find(Friendship, {
      $or: [
        { user: { id: userId }, friend: { id: friendId } },
        { user: { id: friendId }, friend: { id: userId } }
      ],
      status: 'active'
    });

    if (friendships.length === 0) {
      throw new Error('Friendship not found');
    }

    await em.removeAndFlush(friendships);

    // Also remove any friend requests between these users
    const friendRequests = await em.find(FriendRequest, {
      $or: [
        { requester: { id: userId }, addressee: { id: friendId } },
        { requester: { id: friendId }, addressee: { id: userId } }
      ]
    });

    if (friendRequests.length > 0) {
      await em.removeAndFlush(friendRequests);
    }

    this.eventService.emitUpdateFriendList({
      updateReason: 'friend_removed',
      friends: [],
      totalCount: 0,
      targetUserIds: [userId, friendId]
    });
  }

  // Get friend request by email
  async getFriendRequestByEmail(em: EntityManager, requesterId: string, addresseeEmail: string): Promise<FriendRequest | null> {
    const addressee = await em.findOne(User, { email: addresseeEmail });
    if (!addressee) {
      return null;
    }

    const friendRequest = await em.findOne(FriendRequest, {
      requester: { id: requesterId },
      addressee: { id: addressee.id },
      status: 'pending'
    }, { populate: ['requester', 'addressee'] });

    if (!friendRequest) {
      return null;
    }

    return friendRequest;
  }

  // Get friend IDs for online/offline broadcast
  async getFriendIds(em: EntityManager, userId: string): Promise<string[]> {
    const friendships = await em.find(Friendship, {
      user: { id: userId },
      status: 'active'
    }, { populate: ['friend'] });
    return friendships.map(f => f.friend.id);
  }
}
