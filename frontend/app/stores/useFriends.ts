import { useState, useEffect, useCallback } from 'react';
import { friendshipAPI, type FriendsListResponse } from '../api/friendship';
import type { 
  Friend, 
  FriendRequest, 
  FriendListResponseMessage, 
  UserStatusMessage, 
  WebSocketEventHandlers,
  FriendRequestMessage,
  FriendRequestResponseMessage,
  ErrorMessage
} from '../types/realtime.types';
import { websocketService } from '../services/websocket.service';
import toast from 'react-hot-toast';
import { useAuth } from './useAuth';



interface UseFriendsState {
  friends: Friend[];
  blockedFriends: Friend[];
  pendingRequests: FriendRequest[];
  // onlineFriends: Friend[];
  loading: boolean;
  error: string | null;
}

interface UseFriendsActions {
  loadFriends: () => Promise<void>;
  loadBlockedFriends: () => Promise<void>;
  loadPendingRequests: () => Promise<void>;
  // loadOnlineFriends: () => Promise<void>;
  sendFriendRequest: (email: string) => Promise<void>;
  acceptFriendRequest: (requestId: string) => Promise<void>;
  rejectFriendRequest: (requestId: string) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  blockFriend: (friendId: string) => Promise<void>;
  unblockFriend: (friendId: string) => Promise<void>;
  handleFriendListUpdate: (message: FriendListResponseMessage) => void;
  handleFriendListError: (errorMessage: any) => void;
  clearError: () => void;
}

export const useFriends = (): UseFriendsState & UseFriendsActions => {
  const [state, setState] = useState<UseFriendsState>({
    friends: [],
    blockedFriends: [],
    pendingRequests: [],
    // onlineFriends: [],
    loading: false,
    error: null
  });

  // Get current user from auth store
  const { user } = useAuth();

  // Load friends list
  const loadFriends = useCallback(async () => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot load friends');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response: FriendsListResponse = await friendshipAPI.getFriends();
      
      // Check if API call returned null (user not logged in)
      if (!response) {
        console.log('User not logged in, skipping friends loading');
        setState(prev => ({ ...prev, loading: false }));
        return;
      }
      setState(prev => ({
        ...prev,
        friends: response.payload.friends,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load friends';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, []);

  // Load pending friend requests
  const loadPendingRequests = useCallback(async () => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot load pending requests');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const requests = await friendshipAPI.getPendingRequests();
      
      setState(prev => ({
        ...prev,
        pendingRequests: requests,
        loading: false
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load pending requests';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, []);

  // // Load online friends
  // const loadOnlineFriends = useCallback(async () => {
  //   setState(prev => ({ ...prev, loading: true, error: null }));
  //   try {
  //     const response = await friendshipAPI.getOnlineFriends();
  //     // 백엔드에서 이미 Friend 타입과 동일한 구조로 제공
  //     const onlineFriends: Friend[] = response.friends.map(friend => ({
  //       id: friend.id,
  //       name: friend.name,
  //       email: friend.email,
  //       avatarUrl: friend.avatarUrl || '',
  //       isOnline: friend.isOnline,
  //       lastSeen: friend.connectedAt || new Date()
  //     }));
  //     setState(prev => ({
  //       ...prev,
  //       onlineFriends,
  //       loading: false
  //     }));
  //   } catch (error) {
  //     const errorMessage = error instanceof Error ? error.message : 'Failed to load online friends';
  //     setState(prev => ({
  //       ...prev,
  //       error: errorMessage,
  //       loading: false
  //     }));
  //     toast.error(errorMessage);
  //   }
  // }, []);

  // Send friend request
  const sendFriendRequest = useCallback(async (email: string) => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot send friend request');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.sendFriendRequest(email);
      // Optionally reload pending requests to see the sent request
      await loadPendingRequests();
      setState(prev => ({ ...prev, loading: false }));
      toast.success('Friend request sent successfully!');
    } catch (error) {
      let errorMessage = 'Failed to send friend request.';
      
      if (error instanceof Error) {
        const message = error.message.toLowerCase();
        if (message.includes('user with this email not found')) {
          errorMessage = 'No user found with this email address. Please check the email and try again.';
        } else if (message.includes('friend request already exists')) {
          errorMessage = 'Friend request already sent to this user.';
        } else if (message.includes('cannot send friend request to yourself')) {
          errorMessage = 'You cannot send a friend request to yourself.';
        } else if (message.includes('you are already friends with this user')) {
          errorMessage = 'You are already friends with this user.';
        } else if (message.includes('user not authenticated') || message.includes('please login again')) {
          errorMessage = 'Please log in again to send friend requests.';
        } else {
          errorMessage = error.message;
        }
      }
      
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
      // Re-throw the error so AddFriendForm can also handle it
      throw error;
    }
  }, [loadPendingRequests]);

  // Accept friend request
  const acceptFriendRequest = useCallback(async (requestId: string) => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot accept friend request');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.acceptFriendRequest(requestId);
      // Reload both friends and pending requests
      await Promise.all([loadFriends(), loadPendingRequests()]);
      toast.success('Friend request accepted!');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to accept friend request';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, [loadFriends, loadPendingRequests]);

  // Reject friend request
  const rejectFriendRequest = useCallback(async (requestId: string) => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot reject friend request');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.rejectFriendRequest(requestId);
      // Optimistically remove the request from state for instant UI feedback
      setState(prev => ({
        ...prev,
        pendingRequests: prev.pendingRequests.filter(r => r.id !== requestId),
        loading: false
      }));
      toast.success('Friend request rejected.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to reject friend request';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, []);

  // Remove friend
  const removeFriend = useCallback(async (friendId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.removeFriend(friendId);
      // Reload friends list
      await loadFriends();
      toast.success('Friend removed successfully.');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove friend';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, [loadFriends]);

  // Load blocked friends
  const loadBlockedFriends = useCallback(async () => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot load blocked friends');
      return;
    }
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const response: FriendsListResponse = await friendshipAPI.getBlockedFriends();
      
      setState(prev => ({
        ...prev,
        blockedFriends: response.payload.friends,
        loading: false
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to load blocked friends',
        loading: false
      }));
      toast.error(error instanceof Error ? error.message : 'Failed to load blocked friends');
    }
  }, []);

  // Block friend
  const blockFriend = useCallback(async (friendId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.blockFriend(friendId);
      // Reload both friends and blocked friends lists
      await Promise.all([loadFriends(), loadBlockedFriends()]);
      toast.success('Friend blocked successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to block friend';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, [loadFriends, loadBlockedFriends]);

  // Unblock friend
  const unblockFriend = useCallback(async (friendId: string) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      await friendshipAPI.unblockFriend(friendId);
      // Reload both friends and blocked friends lists
      await Promise.all([loadFriends(), loadBlockedFriends()]);
      toast.success('Friend unblocked successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to unblock friend';
      setState(prev => ({
        ...prev,
        error: errorMessage,
        loading: false
      }));
      toast.error(errorMessage);
    }
  }, [loadFriends, loadBlockedFriends]);

  // Handle real-time friend list updates from WebSocket
  const handleFriendListUpdate = useCallback((message: FriendListResponseMessage) => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot handle friend list update');
      return;
    }
    setState(prev => ({
      ...prev,
      friends: message.payload.friends
    }));
  }, []);

  // Handle friend list update errors from WebSocket
  const handleFriendListError = useCallback((errorMessage: any) => {
    if (!user && !useAuth.getState().isLoggingIn) {
      console.error('❌ User not authenticated, cannot handle friend list error');
      return;
    }
    // console.error('Friend list update error:', errorMessage);
    // show error message to user
    setState(prev => ({
      ...prev,
      error: errorMessage.payload?.message || 'Failed to update friend list'
    }));
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);

  // // Load initial data
  // useEffect(() => {
  //   if (!user) {
  //     console.log('🔐 User not logged in, skipping friends auto-load');
  //     return;
  //   }
    
  //   console.log('🔄 Auto-loading friends data for user:', user.name);
  //   loadFriends();
  //   loadBlockedFriends();
  //   loadPendingRequests();
  // }, [user, loadFriends, loadBlockedFriends, loadPendingRequests]);

  // WebSocket event handlers
  useEffect(() => {
      const handlers: Partial<WebSocketEventHandlers> = {
        onUserStatus: (message: UserStatusMessage) => {
          // console.log('🟢 useFriends onUserStatus received:', message);
          
          // Update friends state with optimization
          setState(prev => {
            // Check if update is needed
            const targetFriend = prev.friends.find(friend => friend.id === message.payload.userId);
            if (!targetFriend || targetFriend.isOnline === message.payload.isOnline) {
              // console.log('🟢 Skipping duplicate status update for:', message.payload.userId);
              return prev; // No change needed
            }
            
            const updatedFriends = prev.friends.map(friend =>
              friend.id === message.payload.userId
                ? { ...friend, isOnline: message.payload.isOnline }
                : friend
            );
            return { ...prev, friends: updatedFriends };
          });

          // Dispatch custom event for other components
          window.dispatchEvent(new CustomEvent('userStatusUpdate', {
            detail: {
              userId: message.payload.userId,
              isOnline: message.payload.isOnline
            }
          }));
        },
        
      onFriendRequest: (message: FriendRequestMessage) => {
        console.log('Friend request received:', message);
        loadPendingRequests();
      },
      onFriendRequestResponse: (message: FriendRequestResponseMessage) => {
        console.log('Friend request response:', message);
        loadFriends();
        loadPendingRequests();
      },
      onFriendList: (message: FriendListResponseMessage) => {
        handleFriendListUpdate(message);
      },
      onErrorMessage: (message: ErrorMessage) => {
        console.log('WebSocket error message:', message);
        
        // handle friend list update error
        if (message.payload?.code === 'FRIEND_LIST_UPDATE_ERROR') {
          handleFriendListError(message);
        }
      }
    };
    websocketService.addEventHandlers(handlers);
  }, []);

  return {
    ...state,
    loadFriends,
    loadBlockedFriends,
    loadPendingRequests,
    // loadOnlineFriends,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    blockFriend,
    unblockFriend,
    handleFriendListUpdate,
    handleFriendListError,
    clearError
  };
}; 