import { Entity, PrimaryKey, Property, Enum, Index } from "@mikro-orm/core";

@Entity()
@Index({properties:['roomId', 'timestamp']})
export class ChatMessage {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid' })
  roomId!: string;

  @Property({ type: 'uuid' })
  userId!: string;

  @Property()
  name!: string;

  @Property()
  content!: string;

  @Enum({ items: ['text', 'image', 'file'] })
  messageType: 'text' | 'image' | 'file' = 'text';

  @Property()
  timestamp: number = Date.now();

  // File metadata (optional, only for image/file messages)
  @Property({ nullable: true })
  originalFilename?: string;

  @Property({ nullable: true })
  mimeType?: string;

  @Property({ nullable: true })
  fileSize?: number;
} 