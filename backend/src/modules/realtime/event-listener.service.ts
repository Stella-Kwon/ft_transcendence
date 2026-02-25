import { EventService } from './event.service';
import { RoomService } from './room.service';
import { ConnectionService } from './connection.service';
import { MessageService } from './message.service';
import { FriendshipService } from './friendship.service';
import { NotificationMessage} from './dto';
import { WebSocketErrorHandler } from './websocket-error-handler';
import { UnreadCountMessage } from './dto/sync.schema';

export class EventListenerService {
  constructor(
    private eventService: EventService,
    private roomService: RoomService,
    private connectionService: ConnectionService,
    private messageService: MessageService,
    private friendshipService: FriendshipService,
    private orm: any // MikroORM instance
  ) {}

  setupEventListeners(
    sendToUser: (userId: string, message: any) => Promise<void>,
    broadcastToRoom: (roomId: string, message: any) => Promise<void>
  ) {
    // 1. user status update event listener
    this.eventService.onUserStatusUpdate(async (data) => {
      try {
        const { userId, isOnline } = data;
        const em = this.orm.em.fork();
        const friends = await this.friendshipService.getFriendIds(em, userId);
        const message = {
          id: `user_status_${Date.now()}`,
          timestamp: Date.now(),
          version: '1.0',
          type: 'user_status',
          payload: { userId, isOnline }
        };
        const results = await Promise.allSettled(
          friends.map(friendId => sendToUser(friendId, message))
        );
        results.forEach((result, i) => {
          if (result.status === 'rejected') {
            console.error(`Error sending status update to friend ${friends[i]}:`, result.reason);
          }
        });
      } catch (error) {
        console.error('Error broadcasting user status update:', error);
      }
    });

    // 2. room joined event listener only for notification
    this.eventService.onRoomJoined(async (data) => {
      try {
        const { roomId, roomName, inviterName, inviteeName } = data;

        const roomJoinedMessage: NotificationMessage = {
          id: `room_joined_${Date.now()}`,
          type: 'room_joined',
          payload: {
            roomId,
            roomName,
            inviterName,
            newMemberName: inviteeName,
          },
          timestamp: Date.now(),
          version: '1.0'
        };

        await broadcastToRoom(roomId, roomJoinedMessage);
      } catch (error) {
        console.error('Error broadcasting room joined event:', error);
      }
    });

    // 3. room leave event listener
    this.eventService.onLeaveRoom(async (data) => {
      try {
        const { roomId, userId, name } = data;

        const leaveRoomMessage = {
          id: `leave_room_${Date.now()}`,
          type: 'leave_room',
          payload: {
            roomId,
            userId,
            name
          },
          timestamp: Date.now(),
          version: '1.0'
        };

        await broadcastToRoom(roomId, leaveRoomMessage);
      } catch (error) {
        console.error('Error handling room leave event:', error);
      }
    });

    // 4. friend request event listener
    this.eventService.onFriendRequest(async (data) => {
      try {
        const friendRequestMessage: NotificationMessage = {
          id: `friend_request_${Date.now()}`,
          version: '1.0',
          timestamp: Date.now(),
          type: 'friend_request',
          payload: {
            requesterId: data.requesterId,
            requesterName: data.requesterName,
            addresseeId: data.addresseeId,
            addresseeEmail: data.addresseeEmail,
            addresseeName: data.addresseeName,
            message: `${data.requesterName} has requested to be your friend.`,
            createdAt: data.createdAt
          }
        };

        await sendToUser(data.addresseeId, friendRequestMessage);
      } catch (error) {
        console.error('Error handling friend request event:', error);
      }
    });

    // 5. friend request response event listener
    this.eventService.onFriendRequestResponse(async (data) => {
      try {
        const friendResponseMessage: NotificationMessage = {
          id: `friend_response_${Date.now()}`,
          type: 'friend_request_response',
          payload: {
            requestId: `req_${Date.now()}`,
            requesterId: data.requesterId,
            requesterName: data.requesterName,
            addresseeId: data.addresseeId,
            addresseeName: data.addresseeName,
            status: data.status,
            createdAt: Date.now(),
            acceptedAt: data.status === 'accepted' ? Date.now() : undefined
          },
          timestamp: Date.now(),
          version: '1.0'
        };

        await sendToUser(data.requesterId, friendResponseMessage);

        if (data.status === 'accepted') {
          try {
            await this.sendFriendListUpdateToUsers(
              [data.requesterId, data.addresseeId],
              'friend_request_accepted',
              sendToUser
            );
          } catch (friendListError) {
            console.error('Error updating friend list:', friendListError);

            const affectedUsers = [data.requesterId, data.addresseeId];
            for (const userId of affectedUsers) {
              if (this.connectionService.isUserOnline(userId)) {
                try {
                  const errorMessage = WebSocketErrorHandler.createErrorMessage(
                    'FRIEND_LIST_UPDATE_ERROR',
                    'Friend request accepted, but failed to update friend list. Please refresh the page.',
                    {
                      updateReason: 'friend_request_accepted',
                      requesterId: data.requesterId,
                      addresseeId: data.addresseeId,
                      error: friendListError instanceof Error ? friendListError.message : 'Unknown error'
                    }
                  );
                  await sendToUser(userId, errorMessage);
                } catch (notificationError) {
                  console.error(`Failed to send error notification to user ${userId}:`, notificationError);
                }
              }
            }
          }
        }

      } catch (error) {
        console.error('Error handling friend request response event:', error);
      }
    });

    // 6. friend list update event listener
    this.eventService.onUpdateFriendList(async (data) => {
      try {
        const targetUsers = data.targetUserIds || [];

        if (targetUsers.length === 0) {
          return;
        }

        await this.sendFriendListUpdateToUsers(
          targetUsers,
          data.updateReason!,
          sendToUser
        );

      } catch (error) {
        console.error('Error handling friend list update event:', error);

        const targetUsers = data.targetUserIds || [];
        for (const userId of targetUsers) {
          if (this.connectionService.isUserOnline(userId)) {
            try {
              const errorMessage = WebSocketErrorHandler.createErrorMessage(
                'FRIEND_LIST_UPDATE_ERROR',
                'Failed to update friend list. Please refresh the page or try again later.',
                { updateReason: data.updateReason, error: error instanceof Error ? error.message : 'Unknown error' }
              );
              await sendToUser(userId, errorMessage);
            } catch (notificationError) {
              console.error(`Failed to send error notification to user ${userId}:`, notificationError);
            }
          }
        }
      }
    });

    // 7. unread count update event listener
    this.eventService.onUnreadCountUpdate(async (data) => {
      try {
        if (this.connectionService.isUserOnline(data.userId)) {
          const unreadCountMessage: UnreadCountMessage = {
            id: `unread_${Date.now()}`,
            type: 'unread_count',
            payload: {
              roomId: data.roomId,
              unreadCount: data.unreadCount
            },
            timestamp: Date.now(),
            version: '1.0'
          };

          await sendToUser(data.userId, unreadCountMessage);
        }
      } catch (error) {
        console.error('Error handling unread count update event:', error);
      }
    });
  }

  private async sendFriendListUpdateToUsers(
    userIds: string[],
    updateReason: 'friend_request_accepted' | 'friend_blocked' | 'friend_unblocked' | 'friend_removed',
    sendToUser: (userId: string, message: any) => Promise<void>
  ): Promise<void> {
    const onlineUsers = userIds.filter(userId => this.connectionService.isUserOnline(userId));

    await Promise.allSettled(
      onlineUsers.map(async (userId) => {
        try {
          const em = this.orm.em.fork();
          const updatedFriendList = await this.friendshipService.getFriendsList(
            em,
            userId,
            updateReason
          );
          await sendToUser(userId, updatedFriendList);
        } catch (userError) {
          console.error(`Error sending friend list to user ${userId}:`, userError);
          try {
            const errorMessage = WebSocketErrorHandler.createErrorMessage(
              'FRIEND_LIST_UPDATE_ERROR',
              'Failed to update your friend list. Please refresh the page or try again later.',
              { updateReason, userId, error: userError instanceof Error ? userError.message : 'Unknown error' }
            );
            await sendToUser(userId, errorMessage);
          } catch (notificationError) {
            console.error(`Failed to send error notification to user ${userId}:`, notificationError);
          }
        }
      })
    );
  }
}
