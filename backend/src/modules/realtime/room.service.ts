import { EntityManager } from "@mikro-orm/core";
import { randomUUID } from 'crypto';
import { Room } from "./entities/room.entity";
import { RoomMember as RoomMemberEntity } from "./entities/room-member.entity";
import { UserReadMessageEntity } from "./entities/user-read-message.entity";
import { User } from "../user/entities/user.entity";
import { NotFoundException } from "../../common/exceptions/NotFoundException";
import { BadRequestException } from "../../common/exceptions/BadRequestException";
export class RoomService {
  // In-memory room tracking for WebSocket connections: caching for quick access
  private usersInRoom = new Map<string, Set<string>>(); // roomId -> Set of userId
  private roomsInUser = new Map<string, Set<string>>(); // userId -> Set of roomIds

  constructor() {}

// <Database Operations> ---------------------------------
  async createRoom(em: EntityManager, name: string, masterId: string, description?: string, isPrivate = false, maxUsers = 50): Promise<Room> {
    // Check if user already has a room with the same name (only among user's rooms)
    const userRooms = await this.getUserRooms(em, masterId);
    // console.log(`[createRoom] User ${masterId} has ${userRooms.length} rooms:`, userRooms.map(r => r.name));
    
    const existingUserRoom = userRooms.find(room => room.name === name);
    if (existingUserRoom) {
      // console.log(`[createRoom] Duplicate room name found: "${name}" for user ${masterId}`);
      throw new BadRequestException(`You already have a room named "${name}". Please choose a different name.`);
    }

    // console.log(`[createRoom] Creating room "${name}" for user ${masterId}`);

    const room = em.create(Room, {
      id: randomUUID(),
      name,
      masterId,
      description,
      isPrivate,
      maxUsers,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await em.persistAndFlush(room);
    
    // Add master to room members after room is persisted
    const user = await em.findOne(User, { id: masterId });
    if (user) {
      this.addUserToRoomInMemory(masterId, room.id);
      await this.addUsersToRoomDatabase(em, room.id, [user.name], masterId, user.name);
    }
    
    // Return room with populated members for accurate memberCount
    return await em.findOne(Room, { id: room.id }, { populate: ['members'] }) || room;
  }

  async getRoom(em: EntityManager, roomId: string): Promise<Room | null> {
    const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
    if (!room) {
      throw new NotFoundException('Room not found');
    }
    return room;
  }


  // Find user by name (for invitation system)
  async findUserByName(em: EntityManager, name: string): Promise<User> {
    const user = await em.findOne(User, { name });
    if (!user) {
      throw new NotFoundException(`User ${name} not found`);
    }
    return user;
  }
  
  // Add users to room (database only, for HTTP API)
  async addUsersToRoomDatabase(em: EntityManager, roomId: string, inviteeNames: string[], inviterId: string, inviterName: string): Promise<{ success: string[], failed: { name: string, reason: string }[] }> {
    const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
    if (!room) throw new NotFoundException('Room not found');

    //the reason using this rather than throwing an error is that we want to process possible users to be invited
    const results = {
      success: [] as string[],
      failed: [] as { name: string, reason: string }[]
    };

    for (const name of inviteeNames) {
      try {
        const inviteeUser = await this.findUserByName(em, name);

        const existingMember = room.members.getItems().find(member => member.userId === inviteeUser.id);
        if (existingMember) {
          results.failed.push({ name, reason: 'User already in room' });
          continue;
        }
        if (room.members.length >= room.maxUsers) {
          results.failed.push({ name, reason: 'Room is full' });
          continue;
        }
        const member = em.create(RoomMemberEntity, {
          id: randomUUID(),
          userId: inviteeUser.id,
          name,
          joinedAt: new Date(),
          room,
        });

        room.members.add(member);
        this.addUserToRoomInMemory(inviteeUser.id, roomId);

        const userReadMessage = em.create(UserReadMessageEntity, {
          id: randomUUID(),
          user: inviteeUser,
          room,
          lastReadTimestamp: Date.now(),
          unreadCount: 0,
          updatedAt: new Date()
        });
        em.persist(userReadMessage);

        results.success.push(name);
        
      } catch (error) {
        if (error instanceof NotFoundException) {
          results.failed.push({ name, reason: 'User not found' });
        } else {
          results.failed.push({ name, reason: 'Failed to add user' });
        }
      }
    }
    //store updates
    if (results.success.length > 0) {
      room.updatedAt = new Date();
      await em.persistAndFlush(room);
    }

    return results;
  }

  // Get room members (database)
  async getRoomMembers(em: EntityManager, roomId: string): Promise<RoomMemberEntity[]> {
    const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }

    return room.members.getItems();
  }

  // Check if user is in room (database)
  async isUserInRoomDatabase(em: EntityManager, roomId: string, userId: string): Promise<boolean> {
    const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }

    return room.members.getItems().some(member => member.userId === userId);
  }

  // Remove user from room (database)
  async removeUserFromRoomDatabase(em: EntityManager, roomId: string, userId: string): Promise<void> {
    const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found`);
    }

    // console.log(`Room found: ${room.name}, current members: ${room.members.length}`);
    
    const member = room.members.getItems().find(member => member.userId === userId);
    if (!member) {
      // console.log(`User ${userId} not found in room ${roomId} members`);
      // console.log(`Current members: ${room.members.getItems().map(m => `${m.name}(${m.userId})`).join(', ')}`);
      throw new NotFoundException(`User ${userId} not found in room ${roomId}`);
    }

    // console.log(`Found member ${member.name} (${member.userId}), removing...`);
    
    room.members.remove(member);
    room.updatedAt = new Date();

    await em.persistAndFlush(room);
    await this.checkAndDeleteEmptyRoom(em, roomId);
  }

  // rm room automatically
  private async checkAndDeleteEmptyRoom(em: EntityManager, roomId: string): Promise<boolean> {
    try {
      const room = await em.findOne(Room, { id: roomId }, { populate: ['members'] });
      if (!room) return false;
      if (room.members.length === 0) {
        console.log(`Room ${room.name} (${roomId}) is empty, deleting...`);
        //rm related data in room
        await this.cleanupEmptyRoomData(em, roomId);
        //rm room itself
        await em.removeAndFlush(room);
        //rm from our Map
        this.usersInRoom.delete(roomId);
        // console.log(`Empty room ${room.name} (${roomId}) deleted successfully`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking/deleting empty room:', error);
      return false;
    }
  }

  //rm all the empty room's data 
  private async cleanupEmptyRoomData(em: EntityManager, roomId: string): Promise<void> {
    try {
      // 1. rm all UserReadMessage
      await em.nativeDelete('UserReadMessage', { room: roomId });
      // 2. rm all ChatMessage
      await em.nativeDelete('ChatMessage', { roomId });
      // console.log(`Cleaned up all data (messages, read states) for room ${roomId}`);
    } catch (error) {
      console.error('Error cleaning up room data:', error);
    }
  }

  // Leave room (both memory and database)
  async leaveRoom(em: EntityManager, userId: string, roomId: string): Promise<void> {
    // Remove from database (throws exception if fails)
    await this.removeUserFromRoomDatabase(em, roomId, userId);
    // Remove from in-memory cache
    this.removeUserFromRoom(userId, roomId);
  }

  // Get rooms that a user has joined
  async getUserRooms(em: EntityManager, userId: string): Promise<Room[]> {
    const roomMembers = await em.find(RoomMemberEntity, { userId: userId }, { populate: ['room'] });
    return roomMembers.map(member => member.room);
  }


  //<Memory Operations> --------------------------------

  // Add user to room in memory 
  addUserToRoomInMemory(userId: string, roomId: string): boolean {
    // Add room to user's rooms
    if (!this.roomsInUser.has(userId)) {
      this.roomsInUser.set(userId, new Set());
    }
    this.roomsInUser.get(userId)!.add(roomId);

    // Add user to room's members
    if (!this.usersInRoom.has(roomId)) {
      this.usersInRoom.set(roomId, new Set());
    }
    this.usersInRoom.get(roomId)!.add(userId);

    return true;
  }

  // Remove user from room in memory
  removeUserFromRoom(userId: string, roomId: string): boolean {
    // Remove room from user's rooms
    const roomsInUser = this.roomsInUser.get(userId);
    if (roomsInUser) {
      roomsInUser.delete(roomId);
      if (roomsInUser.size === 0) {
        this.roomsInUser.delete(userId);
      }
    }
    
    // Remove user from room's members
    const roomMembers = this.usersInRoom.get(roomId);
    if (roomMembers) {
      roomMembers.delete(userId);
      if (roomMembers.size === 0) {
        this.usersInRoom.delete(roomId);
      }
    }

    return true;
  }

  // Get users in the room (memory) - quicker to search in memory than in database
  getUsersInRoom(roomId: string): string[] {
    const roomMembers = this.usersInRoom.get(roomId);
    return roomMembers ? Array.from(roomMembers) : [];
  }

  //Get users memeber from the same room
  getRoomMembersFromMemory(roomId: string): string[] {
    return this.getUsersInRoom(roomId);
  }

  //get all the rooms that the user in
  getUserRoomsFromMemory(userId: string): string[] {
    const userRooms = this.roomsInUser.get(userId);
    return userRooms ? Array.from(userRooms) : [];
  }

  // Check if user is in room (memory)
  isUserInRoomMemory(roomId: string, userId: string): boolean {
    const roomMembers = this.usersInRoom.get(roomId);
    return roomMembers ? roomMembers.has(userId) : false;
  }




} 