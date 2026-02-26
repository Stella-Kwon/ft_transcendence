import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { 
  ChatMessage,
  PingMessage, 
  PongMessage
} from './dto';
import { ChatMessage as ChatMessageEntity } from './entities/chat-message.entity';


//later may better to implement archive message service to save old messages to old-mess-database and delete old messages from message-database
export interface MessageQueue {
  id: string;
  roomId: string;
  messages: ChatMessage[];
  maxSize: number;
}

export class MessageService {
  private maxQueueSize = 1000; // Default max messages per room
  
  // In-memory message cache: Map<roomId, ChatMessage[]>
  // Consider enhancing this to handle overload (more storage) in the meantime
  private messageCache = new Map<string, ChatMessage[]>();

  constructor() {}

  // save a chat message to the database
  async saveChatMessageToDatabase(
    em: EntityManager, 
    roomId: string, 
    userId: string,
    name: string,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    originalFilename?: string,
    mimeType?: string,
    fileSize?: number
  ): Promise<ChatMessageEntity> {
    const chatMessageEntity = em.create(ChatMessageEntity, {
      id: randomUUID(),
      roomId,
      userId,
      name, 
      content,
      messageType,
      timestamp: Date.now(),
      // File metadata (if present)
      originalFilename,
      mimeType,
      fileSize,
    });

    await em.persistAndFlush(chatMessageEntity);
    return chatMessageEntity;
  }

  setInChatMessageForm(chatMessageEntity: ChatMessageEntity): ChatMessage {
      // Convert entity back to schema format
    const chatMessage: ChatMessage = {
      id: chatMessageEntity.id,
      timestamp: chatMessageEntity.timestamp,
      version: '1.0',
      type: 'chat',
      payload: {
        roomId: chatMessageEntity.roomId,
        userId: chatMessageEntity.userId,
        name: chatMessageEntity.name,
        content: chatMessageEntity.content,
        messageType: chatMessageEntity.messageType || 'text',
        // File metadata (if present)
        originalFilename: chatMessageEntity.originalFilename,
        mimeType: chatMessageEntity.mimeType,
        fileSize: chatMessageEntity.fileSize,
      }
    };
    return chatMessage;
  }

  setMapInChatMessageForm(chatMessageEntities: ChatMessageEntity[]): ChatMessage[] {
    // Convert entity back to schema format
    const chatMessages: ChatMessage[] = chatMessageEntities.map(chatMessageEntity => ({
      id: chatMessageEntity.id,
      timestamp: chatMessageEntity.timestamp,
      version: '1.0', 
      type: 'chat',
      payload: {
        roomId: chatMessageEntity.roomId,
        userId: chatMessageEntity.userId,
        name: chatMessageEntity.name,
        content: chatMessageEntity.content,
        messageType: chatMessageEntity.messageType || 'text',
        // File metadata (if present)
        originalFilename: chatMessageEntity.originalFilename,
        mimeType: chatMessageEntity.mimeType,
        fileSize: chatMessageEntity.fileSize,
      }
    }));
    return chatMessages;
  }

  // Get messages from cache or database
  private async getMessagesFromCache(em: EntityManager, roomId: string): Promise<ChatMessage[]> {
    // 캐시에 있으면 반환
    if (this.messageCache.has(roomId)) {
      return this.messageCache.get(roomId)!;
    }

    //if no cache, load from database
    const messages = await em.find(ChatMessageEntity, 
      { roomId }, 
      { orderBy: { timestamp: 'ASC' } }
    );
    
    const chatMessages = this.setMapInChatMessageForm(messages);
    this.messageCache.set(roomId, chatMessages);
    
    return chatMessages;
  }

  // Add message to cache
  private addMessageToCache(roomId: string, message: ChatMessage): void {
    const messages = this.messageCache.get(roomId) || [];
    messages.push(message);
    
    // Enforce maxQueueSize in cache
    if (messages.length > this.maxQueueSize) {
      //left only the latest messages to maintain the queue size limit
      messages.splice(0, messages.length - this.maxQueueSize);
    }
    
    this.messageCache.set(roomId, messages);
  }

  // Add multiple messages to cache (for sync operations)
  addMessagesToCache(roomId: string, messages: ChatMessage[]): void {
    const existingMessages = this.messageCache.get(roomId) || [];
    const allMessages = [...existingMessages, ...messages];
    
    // Remove duplicates based on message ID (more efficient with Set)
    const seen = new Set();
    const uniqueMessages = allMessages.filter(msg => {
      if (seen.has(msg.id)) return false;
      seen.add(msg.id);
      return true;
    });
    
    // Enforce maxQueueSize in cache
    if (uniqueMessages.length > this.maxQueueSize) {
      // Keep only the latest messages
      uniqueMessages.splice(0, uniqueMessages.length - this.maxQueueSize);
    }
    
    this.messageCache.set(roomId, uniqueMessages);
    console.log(`[MessageService] Added ${messages.length} messages to cache for room ${roomId}`);
  }

  // Remove message from cache
  private removeMessageFromCache(roomId: string, messageId: string): void {
    const messages = this.messageCache.get(roomId) || [];
    const index = messages.findIndex(msg => msg.id === messageId);
    if (index !== -1) {
      //delete the message from index, how many
      messages.splice(index, 1);
      this.messageCache.set(roomId, messages);
    }
  }

  // Clear cache for a room
  private clearCache(roomId: string): void {
    this.messageCache.delete(roomId);
  }

  // save a chat message to a room's queue
  async saveChatMessage(
    em: EntityManager, 
    roomId: string, 
    userId: string,
    name: string,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    originalFilename?: string,
    mimeType?: string,
    fileSize?: number
  ): Promise<ChatMessage> {
    const chatMessageEntity = await this.saveChatMessageToDatabase(
      em, roomId, userId, name, content, messageType, originalFilename, mimeType, fileSize
    );
    const chatMessage = this.setInChatMessageForm(chatMessageEntity);
    
    // Add to cache
    this.addMessageToCache(roomId, chatMessage);
    
    return chatMessage;
  }

  // Get all messages from a room (from cache)
  async getAllMessages(em: EntityManager, roomId: string): Promise<ChatMessage[]> {
    return await this.getMessagesFromCache(em, roomId);
  }

  // Clear all messages from a room
  async clearMessages(em: EntityManager, roomId: string): Promise<boolean> {
    try {
      await em.nativeDelete(ChatMessageEntity, { roomId });
      this.clearCache(roomId);
      return true;
    } catch (error) {
      console.error('Error clearing messages:', error);
      return false;
    }
  }

  // Delete a specific message
  async deleteMessage(em: EntityManager, roomId: string, messageId: string): Promise<boolean> {
    try {
      const message = await em.findOne(ChatMessageEntity, { id: messageId, roomId });
      if (!message) return false;

      await em.removeAndFlush(message);
      this.removeMessageFromCache(roomId, messageId);
      return true;
    } catch (error) {
      console.error('Error deleting message:', error);
      return false;
    }
  }

  // Create a chat message
  createChatMessage(
    roomId: string,
    userId: string,
    name: string,
    content: string,
    messageType: 'text' | 'image' | 'file' = 'text',
    originalFilename?: string,
    mimeType?: string,
    fileSize?: number
  ): ChatMessage {
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'chat',
      payload: {
        roomId,
        userId,
        name,
        content,
        messageType,
        originalFilename,
        mimeType,
        fileSize,
      },
    };
  }

  // Create a ping message
  createPingMessage(): PingMessage {
    return {
      id: randomUUID(),
      timestamp: Date.now(), // 이것이 ping 시작 시간
      version: '1.0',
      type: 'ping'
    };
  }

  // Create a pong message
  createPongMessage(pingTimestamp: number): PongMessage {
    return {
      id: randomUUID(),
      timestamp: Date.now(),
      version: '1.0',
      type: 'pong',
      payload: {
        latency: Date.now() - pingTimestamp // 원본 ping timestamp로 레이턴시 계산
      }
    };
  }
}