import { EntityManager } from "@mikro-orm/core";
import { MessageService } from "./message.service";
import { SyncService } from "./sync.service";
import { RoomService } from "./room.service";
import { EventService } from "./event.service";

import { AnyMessage, ChatMessage, PingMessage, RoomStateMessage, MarkReadMessage } from "./dto";

export class WebSocketMessageHandler {
  constructor(
    private readonly messageService: MessageService,
    private readonly syncService: SyncService,
    private readonly roomService: RoomService,
    private readonly eventService: EventService,
    private readonly wsConnectionService?: any
  ) {}

  async handleMessage(
    em: EntityManager, 
    message: AnyMessage, 
    userId: string, 
    userName: string,
    sendMessageCallback: (message: any) => void,
    broadcastToRoomCallback: (roomId: string, message: any) => void,
    socketId?: string // Add socketId for pong tracking
  ): Promise<void> {
    // console.log(`WebSocketMessageHandler: Processing ${message.type} for user ${userId}`);
    
    switch ((message as any).type) {
      case 'chat':
        // console.log(`Handling chat message for user ${userId}`);
        await this.handleChatMessage(em, message as ChatMessage, userId, userName, broadcastToRoomCallback);
        break;
      case 'room_state':
        // console.log(`Handling room state request for user ${userId}`);
        if (message.type === 'room_state') {
          await this.handleRoomStateMessage(em, message as RoomStateMessage, userId, sendMessageCallback);
        } else {
          throw new Error('Invalid room_state message format');
        }
        break;
      case 'mark_read':
        // console.log(`Handling mark read message for user ${userId}`);
        await this.handleMarkReadMessage(em, message as MarkReadMessage, userId);
        break;
      case 'ping':
        // console.log(`Handling ping message for user ${userId}`);
        await this.handlePingMessage(message as PingMessage, sendMessageCallback);
        break;
      case 'pong':
        // console.log(`Handling pong message for user ${userId}`);
        await this.handlePongMessage(socketId);
        break;

      default:
        console.warn('Unknown message type:', (message as any).type);
        // unknown message type is propagated to upper layer
        throw new Error(`Unknown message type: ${(message as any).type}`);
    }
  }

  private async handleChatMessage(
    em: EntityManager, 
    message: ChatMessage, 
    userId: string, 
    userName: string,
    broadcastToRoomCallback: (roomId: string, message: any) => void
  ): Promise<void> {
    // console.log(`Processing chat message from ${userName} in room ${message.payload.roomId}`);
    // console.log(`Chat message details:`, {
    //   userId,
    //   userName,
    //   roomId: message.payload.roomId,
    //   content: message.payload.content,
    //   messageType: message.payload.messageType
    // });
    
    const roomId = message.payload.roomId;
    if (!roomId) {
      console.error('Room ID is missing from chat message');
      throw new Error('Room ID is required for chat messages');
    }

    // Check if user is in the room (database check)
    const isUserInRoom = await this.roomService.isUserInRoomDatabase(em, roomId, userId);
    // console.log(`User ${userId} in room ${roomId}: ${isUserInRoom}`);
    
    if (!isUserInRoom) {
      console.error('User ${userId} is not in room ${roomId}');
      throw new Error('User is not a member of this room');
    }

    try {
      // Save message to database
      const chatMessage = await this.messageService.saveChatMessage(
        em, 
        roomId, 
        userId, 
        userName, 
        message.payload.content,
        message.payload.messageType || 'text',
        message.payload.originalFilename,
        message.payload.mimeType,
        message.payload.fileSize
      );
      // console.log(`Message saved to database:`, chatMessage.id);

      // Broadcast to room
      broadcastToRoomCallback(roomId, chatMessage);
      // console.log(`Message broadcasted to room ${roomId}`);
      const roomMembers = await this.roomService.getRoomMembers(em, roomId);
      for (const member of roomMembers) {
        if (member.userId !== userId) {
          const unreadCount = await this.syncService.getUnreadMessageCount(em, member.userId, roomId);
          // console.log(`Updated unread count for user ${member.userId} in room ${roomId}: ${unreadCount}`);
          
          this.eventService.emitUnreadCountUpdate({
            roomId,
            userId: member.userId,
            unreadCount
          });
        }
      }
    } catch (error) {
      console.error(`Error saving/broadcasting chat message:`, error);
      throw error;
    }
  }

  private async handleRoomStateMessage(
    em: EntityManager, 
    message: RoomStateMessage, 
    userId: string,
    sendMessageCallback: (message: RoomStateMessage) => void
  ): Promise<void> {
    const roomId = message.payload.room.id;
    // console.log(`Processing sync request for room ${roomId} from user ${userId}`);
    
    if (!roomId) {
      console.error('Room ID is missing from sync message');
      throw new Error('Room ID is required for sync messages');
    }

    // Get room data
    const room = await this.roomService.getRoom(em, roomId);
    if (!room) {
      console.error(`Room ${roomId} not found`);
      throw new Error(`Room ${roomId} not found`);
    }
    // console.log(`Found room: ${room.name} (${room.id})`);

    // Get room members
    const roomMembers = await this.roomService.getRoomMembers(em, roomId);
    // console.log(`Found ${roomMembers.length} members in room ${room.name}`);
    
    // Get messages and sync data
    const roomData = await this.syncService.syncRoomMessages(em, userId, roomId);
    // console.log(`Sync data for room ${room.name}:`, {
    //   previousMessages: roomData.previousMessages.length,
    //   unreadMessages: roomData.unreadMessages.length,
    //   lastReadTimestamp: roomData.lastReadTimestamp
    // });

    // first mark read and then calculate the actual unread count
    const allMessagesForRead = [...roomData.previousMessages, ...roomData.unreadMessages];
    let actualUnreadCount = roomData.unreadMessages.length;
    
    if (allMessagesForRead.length > 0) {
      const latestMessage = allMessagesForRead[allMessagesForRead.length - 1];
      // console.log(`Auto-marking messages as read up to timestamp: ${latestMessage.timestamp}`);
      await this.syncService.markMessagesAsRead(em, userId, roomId, latestMessage.timestamp);
      
      // calculate the actual unread count
      actualUnreadCount = await this.syncService.getUnreadMessageCount(em, userId, roomId);
      // console.log(`Actual unread count after marking as read: ${actualUnreadCount}`);
    }

    // Create room state message with accurate unread count
    const roomStateMessage : RoomStateMessage = {
      id: `room_state_${Date.now()}`,
      type: 'room_state',
      version: '1.0',
      payload: {
        room: {
          id: room.id,
          name: room.name,
          masterId: room.masterId,
          description: room.description || '',
          isPrivate: room.isPrivate,
          maxUsers: room.maxUsers,
          memberCount: roomMembers.length,
          createdAt: room.createdAt?.getTime() || Date.now(),
          updatedAt: room.updatedAt?.getTime() || Date.now()
        },
        previousMessages: roomData.previousMessages.map((msg: any) => ({
          id: msg.id,
          content: msg.payload.content,
          userId: msg.payload.userId,
          userName: msg.payload.name,
          messageType: msg.payload.messageType,
          timestamp: msg.timestamp,
          isRead: true
        })),
        unreadMessages: roomData.unreadMessages.map((msg: any) => ({
          id: msg.id,
          content: msg.payload.content,
          userId: msg.payload.userId,
          userName: msg.payload.name,
          messageType: msg.payload.messageType,
          timestamp: msg.timestamp,
          isRead: false
        })),
        members: roomMembers.map(member => ({
          userId: member.userId,
          name: member.name,
          joinedAt: member.joinedAt?.getTime() || Date.now(),
          isOnline: this.wsConnectionService?.isUserOnline(member.userId) || false
        })),
        readState: {
          lastReadTimestamp: roomData.lastReadTimestamp,
          unreadCount: actualUnreadCount, // the actual unread count
          totalMessages: roomData.previousMessages.length + roomData.unreadMessages.length
        }
      },
      timestamp: Date.now()
    };
    // console.log(`Sending room state message for room ${room.name}:`, {
    //   roomId: room.id,
    //   totalMessages: roomData.previousMessages.length + roomData.unreadMessages.length,
    //   members: roomMembers.length
    // });
    sendMessageCallback(roomStateMessage);
  }

  private async handleMarkReadMessage(
    em: EntityManager,
    message: MarkReadMessage,
    userId: string
  ): Promise<void> {
    const { roomId, lastReadTimestamp } = message.payload;
    // console.log(`Processing mark read request for room ${roomId} from user ${userId}, timestamp: ${lastReadTimestamp}`);
    
    if (!roomId) {
      console.error('Room ID is missing from mark read message');
      throw new Error('Room ID is required for mark read messages');
    }

    try {
      // Mark messages as read up to the specified timestamp
      await this.syncService.markMessagesAsRead(em, userId, roomId, lastReadTimestamp);
      // console.log(`Messages marked as read for user ${userId} in room ${roomId} up to timestamp ${lastReadTimestamp}`);
      
      // Get updated unread count and emit to user
      const unreadCount = await this.syncService.getUnreadMessageCount(em, userId, roomId);
      // console.log(`Updated unread count for user ${userId} in room ${roomId}: ${unreadCount}`);
      
      this.eventService.emitUnreadCountUpdate({
        roomId,
        userId,
        unreadCount
      });
    } catch (error) {
      console.error(`❌ Error marking messages as read:`, error);
      throw error;
    }
  }

  private async handlePingMessage(
    message: PingMessage, 
    sendMessageCallback: (message: any) => void
  ): Promise<void> {
    // console.log(`Creating pong response for ping message:`, message.id);
    // Create pong response using existing timestamp
    const pongMessage = this.messageService.createPongMessage(message.timestamp);
    // console.log(`Sending pong response:`, pongMessage);
    sendMessageCallback(pongMessage);
  }

  private async handlePongMessage(socketId?: string): Promise<void> {
    // Handle pong for latency tracking using ConnectionManager
    if (socketId && this.wsConnectionService) {
      this.wsConnectionService.handlePongReceived(socketId);
    }
  }


} 