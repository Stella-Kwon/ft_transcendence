import type { Room } from '../types/realtime.types';
import { fetchJson } from './client';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export interface RoomMember {
  userId: string;
  name: string;
  joinedAt: string;
  isOnline: boolean;
}

export interface CreateRoomRequest {
  name: string;
  description?: string;
  isPrivate: boolean;
  maxUsers: number;
}

export interface InviteUsersRequest {
  inviteeNames: string[];
}

export interface InviteUsersResponse {
  success: string[];
  failed: Array<{
    name: string;
    reason: string;
  }>;
  message: string;
}

class RoomAPI {
  // Create a new room
  async createRoom(roomData: CreateRoomRequest): Promise<Room> {
    const response = await fetchJson<Room>(`${API_BASE}/api/realtime/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(roomData)
    });
    
    if (!response) {
      throw new Error('Failed to create room');
    }
    
    return response;
  }

  // Get room by ID
  async getRoom(roomId: string): Promise<Room> {
    const response = await fetchJson<Room>(`${API_BASE}/api/realtime/rooms/${roomId}`);
    
    if (!response) {
      throw new Error('Failed to fetch room');
    }
    
    return response;
  }

  // Get room members
  async getRoomMembers(roomId: string): Promise<RoomMember[]> {
    const response = await fetchJson<RoomMember[]>(`${API_BASE}/api/realtime/rooms/${roomId}/members`);
    
    if (!response) {
      throw new Error('Failed to fetch room members');
    }
    
    return response;
  }

  // Invite users to room
  async inviteUsersToRoom(roomId: string, inviteeNames: string[]): Promise<InviteUsersResponse> {
    const response = await fetchJson<InviteUsersResponse>(`${API_BASE}/api/realtime/rooms/${roomId}/invite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inviteeNames })
    });
    
    if (!response) {
      throw new Error('Failed to invite users');
    }
    
    console.log(`✅ Invite success:`, response);
    return response;
  }

  // Leave room
  async leaveRoom(roomId: string): Promise<{ success: boolean; message: string }> {
    const response = await fetchJson<{ success: boolean; message: string }>(`${API_BASE}/api/realtime/rooms/${roomId}/leave`, {
      method: 'POST'
    });
    
    // console.log(`Response status: ${response.status}`);
    // console.log(`Response headers:`, Object.fromEntries(response.headers.entries()));
    
    if (!response) {
      throw new Error('Failed to leave room');
    }
    
    console.log(`✅ Leave room success:`, response);
    return response;
  }

  // Get user's room list
  async getUserRooms(userId: string): Promise<{
    roomList: (Room & { unreadCount: number })[];
  }> {
    const response = await fetchJson<{
      roomList: (Room & { unreadCount: number })[];
    }>(`${API_BASE}/api/realtime/rooms/${userId}/roomlist`);
    
    if (!response) {
      throw new Error('Failed to fetch user rooms');
    }
    
    return response;
  }
}

export const roomAPI = new RoomAPI(); 