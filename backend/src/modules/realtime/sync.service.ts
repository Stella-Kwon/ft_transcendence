import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { ChatMessage } from './dto';
import { ChatMessage as ChatMessageEntity } from './entities/chat-message.entity';
import { UserReadMessageEntity } from './entities/user-read-message.entity';
import { User } from '../user/entities/user.entity';
import { Room } from './entities/room.entity';

export class SyncService {
  constructor(
    private roomService?: any, // RoomService (optional to avoid circular dependency)
    private friendshipService?: any, // FriendshipService (optional)
    private messageService?: any, // MessageService (optional to avoid circular dependency)
    private eventService?: any // EventService (optional to avoid circular dependency)
  ) {}

  setDependencies(roomService: any, friendshipService: any, messageService: any, eventService: any) {
    this.roomService = roomService;
    this.friendshipService = friendshipService;
    this.messageService = messageService;
    this.eventService = eventService;
  }

  async restoreUserSession(em: EntityManager, userId: string, sendMessageCallback: (message: any) => void): Promise<void> {
    try {
      // 1. Sync friend list
      await this.syncFriendList(em, userId, sendMessageCallback);

      // 2. Restore user rooms to memory
      const userRooms = await this.restoreUserRoomsToMemory(em, userId);

      // 3. Check unread message count per room
      for (const roomId of userRooms) {
        const unreadCount = await this.getUnreadMessageCount(em, userId, roomId);

        if (unreadCount > 0) {
          if (!this.eventService) {
            // console.warn(`[${userId}] EventService not available for unread count update`);
            return;
          }
          this.eventService.emitUnreadCountUpdate({
            roomId,
            userId,
            unreadCount
          });
        }
      }

    } catch (error) {
      console.error(`[${userId}] Error restoring session:`, error);
    }
  }

  async restoreUserRoomsToMemory(em: EntityManager, userId: string): Promise<string[]> {
    try {
      if (!this.roomService) {
        console.warn('RoomService not available for memory restoration');
        return [];
      }

      const userRooms = await this.roomService.getUserRooms(em, userId);
      const roomIds: string[] = [];

      for (const room of userRooms) {
        this.roomService.addUserToRoomInMemory(userId, room.id);
        roomIds.push(room.id);
      }

      return roomIds;
    } catch (error) {
      console.error(`[${userId}] Error restoring rooms to memory:`, error);
      return [];
    }
  }

  async syncFriendList(em: EntityManager, userId: string, sendMessageCallback: (message: any) => void): Promise<void> {
    try {
      if (!this.friendshipService) {
        console.warn('FriendshipService not available for friend sync');
        return;
      }

      const friendList = await this.friendshipService.getFriendsList(em, userId);
      sendMessageCallback({
        id: friendList.id,
        type: 'friend_list',
        payload: friendList.payload,
        timestamp: friendList.timestamp,
        version: friendList.version
      });

    } catch (error) {
      console.error(`[${userId}] Error syncing friend list:`, error);
    }
  }

  // Get previous messages and unread messages for room sync
  async syncRoomMessages(em: EntityManager, userId: string, roomId: string): Promise<{
    previousMessages: ChatMessage[];
    unreadMessages: ChatMessage[];
    lastReadTimestamp: number;
  }> {
    const userRead = await em.findOne(UserReadMessageEntity, { user: { id: userId }, room: { id: roomId } });
    const lastReadTimestamp = userRead?.lastReadTimestamp || 0;

    const allMessageEntities = await em.find(ChatMessageEntity, {
      roomId
    }, {
      orderBy: { timestamp: 'ASC' },
      limit: 1000
    });

    const previousMessages: ChatMessage[] = [];
    const unreadMessages: ChatMessage[] = [];

    for (const msgEntity of allMessageEntities) {
      const chatMessage = this.messageService?.setMapInChatMessageForm([msgEntity])?.[0];
      if (chatMessage) {
        if (msgEntity.timestamp <= lastReadTimestamp) {
          previousMessages.push(chatMessage);
        } else {
          unreadMessages.push(chatMessage);
        }
      }
    }

    // Save messages to memory cache
    if (this.messageService && (previousMessages.length > 0 || unreadMessages.length > 0)) {
      const allMessages = [...previousMessages, ...unreadMessages];
      this.messageService.addMessagesToCache(roomId, allMessages);
    }

    return {
      previousMessages,
      unreadMessages,
      lastReadTimestamp
    };
  }

  // Get unread message count (lightweight query)
  async getUnreadMessageCount(em: EntityManager, userId: string, roomId: string): Promise<number> {
    const userRead = await em.findOne(UserReadMessageEntity, { user: { id: userId }, room: { id: roomId } });
    const lastReadTimestamp = userRead?.lastReadTimestamp || 0;

    const unreadCount = await em.count(ChatMessageEntity, {
      roomId,
      timestamp: { $gt: lastReadTimestamp },
      userId: { $ne: userId }
    });

    return unreadCount;
  }

  // Mark messages as read up to a certain timestamp
  async markMessagesAsRead(em: EntityManager, userId: string, roomId: string, lastReadTimestamp: number): Promise<void> {
    let userRead = await em.findOne(UserReadMessageEntity, { user: { id: userId }, room: { id: roomId } });

    if (!userRead) {
      const user = await em.findOne(User, { id: userId });
      const room = await em.findOne(Room, { id: roomId });

      if (!user || !room) {
        throw new Error(`User ${userId} or Room ${roomId} not found`);
      }

      userRead = em.create(UserReadMessageEntity, {
        id: randomUUID(),
        user,
        room,
        lastReadTimestamp: 0,
        unreadCount: 0,
        updatedAt: new Date()
      });
    }

    userRead.lastReadTimestamp = lastReadTimestamp;
    await em.persistAndFlush(userRead);
  }
}
