import { EventEmitter } from 'events';
import { 
  FriendRequestPayloadSchema, 
  FriendRequestResponsePayloadSchema,
  FriendListResponsePayloadSchema
} from './dto/friend.schema';
import { RoomInvitationPayload } from './dto/room.schema';

export class EventService extends EventEmitter {
  constructor() {
    super();
  
    this.on('error', (error) => {
      console.error('EventService error:', error);
    });
  }

//event emit
  emitUpdateFriendList(data: FriendListResponsePayloadSchema) {
    this.emit('friend:list_update', data);
    console.log(`Event: Friend list updated for ${data.updateReason}`);
  }

  emitFriendRequest(data: FriendRequestPayloadSchema) {
    this.emit('friend:request', data);
    console.log(`Event: Friend request from ${data.requesterName} to ${data.addresseeName}`);
  }

  emitFriendRequestResponse(data: FriendRequestResponsePayloadSchema) {
    this.emit('friend:response', data);
    console.log(`Event: Friend request ${data.status} by ${data.addresseeName} to ${data.requesterName}`);
  }

  emitRoomJoined(data: RoomInvitationPayload) {
    this.emit('room:joined', data);
    console.log(`Event: Room joined - ${data.inviteeName} joined room ${data.roomName}`);
  }

  emitLeaveRoom(data: { roomId: string; userId: string; name: string }) {
    this.emit('room:leave', data);
    console.log(`Event: User ${data.name} left room ${data.roomId}`);
  }

  emitUnreadCountUpdate(data: { roomId: string; userId: string; unreadCount: number }) {
    this.emit('unread:count_update', data);
    console.log(`Event: Unread count updated for user ${data.userId} in room ${data.roomId}: ${data.unreadCount}`);
  }

  emitUserStatusUpdate(data: { userId: string; isOnline: boolean }) {
    this.emit('user:status', data);
    console.log(`Event: User status update for ${data.userId} → ${data.isOnline ? 'online' : 'offline'}`);
  }


// event listener

  onUpdateFriendList(callback: (data: FriendListResponsePayloadSchema) => void) {
    this.on('friend:list_update', callback);
  }

  onFriendRequest(callback: (data: FriendRequestPayloadSchema) => void) {
    this.on('friend:request', callback);
  }

  onFriendRequestResponse(callback: (data: FriendRequestResponsePayloadSchema) => void) {
    this.on('friend:response', callback);
  }

  onRoomJoined(callback: (data: RoomInvitationPayload) => void) {
    this.on('room:joined', callback);
  }

  onLeaveRoom(callback: (data: { roomId: string; userId: string; name: string }) => void) {
    this.on('room:leave', callback);
  }

  onUnreadCountUpdate(callback: (data: { roomId: string; userId: string; unreadCount: number }) => void) {
    this.on('unread:count_update', callback);
  }

  onUserStatusUpdate(callback: (data: { userId: string; isOnline: boolean }) => void) {
    this.on('user:status', callback);
  }

} 