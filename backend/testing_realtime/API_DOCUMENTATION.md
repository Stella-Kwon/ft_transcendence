# ft_transcendence API Documentation

## Base URL
```
http://localhost:3000/api/realtime
```

## Authentication
All endpoints require authentication. Include authentication cookies in your requests.

---

## Room API

### 1. Create Room
**POST** `/rooms`

Create a new chat room.

**Request Body:**
```json
{
  "name": "Room Name",
  "description": "Room description (optional)",
  "isPrivate": false,
  "maxUsers": 50
}
```

**Response (201):**
```json
{
  "id": "room-uuid",
  "name": "Room Name",
  "masterId": "user-uuid",
  "description": "Room description",
  "isPrivate": false,
  "maxUsers": 50,
  "memberCount": 1,
  "createdAt": 1708876800000, => gettime() 13numbers
  "updatedAt": 1708876800000
}
```

### 2. Get Room Details
**GET** `/rooms/:roomId`

Get details of a specific room.

**Response (200):**
```json
{
  "id": "room-uuid",
  "name": "Room Name",
  "masterId": "user-uuid",
  "description": "Room description",
  "isPrivate": false,
  "maxUsers": 50,
  "memberCount": 5,
  "createdAt": 1708876800000,
  "updatedAt": 1708876800000
}
```

### 3. Get User's Room List
**GET** `/rooms/:userId/roomlist`

Get all rooms that a user has joined.

**Response (200):**
```json
{
  "roomList": [
    {
      "id": "room-uuid",
      "name": "Room Name",
      "masterId": "user-uuid",
      "description": "Room description",
      "isPrivate": false,
      "maxUsers": 50,
      "memberCount": 5,
      "unreadCount": 3,
      "createdAt": 1708876800000,
      "updatedAt": 1708876800000
    }
  ]
}
```

### 4. Invite Friends to Room
**POST** `/rooms/:roomId/invite`

Invite multiple friends to a room by their usernames.

**Request Body:**
```json
{
  "inviteeNames": ["username1", "username2", "username3"]
}
```

**Response (200):**
```json
{
  "success": ["username1", "username2"],
  "failed": [
    {
      "name": "username3",
      "reason": "User already in room"
    }
  ],
  "message": "Invited 2 users successfully, 1 failed"
}
```

### 5. Leave Room
**POST** `/rooms/:roomId/leave`

Leave a room.

**Response (200):**
```json
{
  "success": true,
  "message": "John successfully left the room"
}
```

### 6. Get Room Members
**GET** `/rooms/:roomId/members`

Get all members of a room.

**Response (200):**
```json
[
  {
    "userId": "user-uuid",
    "name": "John Doe",
    "joinedAt": 1708876800000,
    "isOnline": true
  }
]
```

---

## Friendship API

### 1. Send Friend Request
**POST** `/friends/requests/:addresseeEmail`

Send a friend request to a user by email.

**Response (200):**
```json
{
  "success": true,
  "message": "Friend request sent to user@example.com successfully"
}
```

### 2. Accept Friend Request
**POST** `/friends/requests/:requestId/accept`

Accept a friend request.

**Response (200):**
```json
{
  "success": true,
  "message": "Friend request accepted successfully"
}
```

### 3. Reject Friend Request
**POST** `/friends/requests/:requestId/reject`

Reject a friend request.

**Response (200):**
```json
{
  "message": "Friend request rejected",
  "requestId": "request-uuid"
}
```

### 4. Get Pending Friend Requests
**GET** `/friends/requests`

Get all pending friend requests for the current user.

**Response (200):**
```json
[
  {
    "id": "request-uuid",
    "requesterId": "user-uuid",
    "requesterName": "John Doe",
    "requesterEmail": "john@example.com",
    "addresseeId": "user-uuid",
    "addresseeName": "Jane Doe",
    "status": "pending",
    "createdAt": 1708876800000
  }
]
```

### 5. Get Friends List
**GET** `/friends`

Get all friends of the current user.

**Response (200):**
```json
{
  "id": "response-uuid",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "friend_list",
  "payload": {
    "friends": [
      {
        "id": "user-uuid",
        "name": "John Doe",
        "email": "john@example.com",
        "avatarUrl": "/files/avatar.png",
        "isOnline": true,
        "lastSeen": 1708876800000
      }
    ],
    "totalCount": 1
  }
}
```

### 6. Get Blocked Friends
**GET** `/friends/blocked`

Get all blocked friends.

**Response (200):** Same structure as friends list.

### 7. Block Friend
**POST** `/friends/:friendId/block`

Block a friend.

**Response (200):**
```json
{
  "success": true,
  "message": "Friend blocked successfully"
}
```

### 8. Unblock Friend
**POST** `/friends/:friendId/unblock`

Unblock a friend.

**Response (200):**
```json
{
  "success": true,
  "message": "Friend unblocked successfully"
}
```

### 9. Remove Friend
**DELETE** `/friends/:friendId`

Remove a friend.

**Response (200):**
```json
{
  "success": true,
  "message": "Friend removed successfully"
}
```

### 10. Get Online Friends
**GET** `/friends/online`

Get all friends with their online status.

**Response (200):**
```json
{
  "success": true,
  "friends": [
    {
      "id": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "isOnline": true,
      "connectedAt": 1708876800000
    }
  ],
  "totalFriends": 5,
  "onlineFriends": 2
}
```

### 11. Get Online Users
**GET** `/users/online`

Get all online users in the system.

**Response (200):**
```json
{
  "success": true,
  "onlineUsers": [
    {
      "userId": "user-uuid",
      "name": "John Doe",
      "email": "john@example.com",
      "connectedAt": "2023-01-01T00:00:00.000Z"
    }
  ]
}
```

---

## Error Responses

All endpoints return error responses in the following format:

```json
{
  "error": "Error message",
  "statusCode": 400,
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

### Common Error Codes:
- **400**: Bad Request - Invalid input data
- **401**: Unauthorized - Authentication required
- **403**: Forbidden - Access denied
- **404**: Not Found - Resource not found
- **500**: Internal Server Error - Server error

---

## Usage Examples

### JavaScript/TypeScript
```javascript
// Send friend request
const response = await fetch('/api/realtime/friends/requests/user@example.com', {
  method: 'POST',
  credentials: 'include'
});

// Create room
const room = await fetch('/api/realtime/rooms', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Room',
    description: 'A cool room',
    isPrivate: false,
    maxUsers: 20
  }),
  credentials: 'include'
});
```

### cURL
```bash
# Get friends list
curl -X GET http://localhost:3000/api/realtime/friends \
  -H "Cookie: session=your-session-cookie"

# Invite friends to room
curl -X POST http://localhost:3000/api/realtime/rooms/room-uuid/invite \
  -H "Content-Type: application/json" \
  -H "Cookie: session=your-session-cookie" \
  -d '{"inviteeNames": ["user1", "user2"]}'
```

---

## WebSocket API

### Connection

```
ws://localhost:3000/api/realtime/ws
```

Authentication via cookie (`accessToken`). Connect with `credentials: 'include'` or pass the cookie header directly.

---

### Base Message Structure

모든 WebSocket 메시지는 아래 구조를 기반으로 함:

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "message_type",
  "payload": { }
}
```

---

### Client → Server Messages

#### 1. chat
채팅 메시지 전송.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "chat",
  "payload": {
    "roomId": "room-uuid",
    "userId": "user-uuid",
    "name": "John Doe",
    "content": "Hello world",
    "messageType": "text"
  }
}
```

`messageType`: `"text"` | `"image"` | `"file"` (default: `"text"`)

파일 메시지일 경우 추가 필드:
```json
{
  "originalFilename": "photo.png",
  "mimeType": "image/png",
  "fileSize": 204800
}
```

---

#### 2. mark_read
특정 방의 메시지를 읽음 처리.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "mark_read",
  "payload": {
    "roomId": "room-uuid",
    "lastReadTimestamp": 1708876800000
  }
}
```

---

#### 3. pong
서버 ping에 대한 응답. 서버가 ping을 보내면 클라이언트가 pong으로 응답해야 함 (30초 주기).

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "pong",
  "payload": {
    "latency": 42
  }
}
```

---

### Server → Client Messages

#### 1. ping
서버가 연결 상태 확인을 위해 30초마다 전송. 클라이언트는 pong으로 응답해야 함.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "ping"
}
```

---

#### 2. chat
방의 다른 멤버가 보낸 채팅 메시지 수신.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "chat",
  "payload": {
    "roomId": "room-uuid",
    "userId": "sender-uuid",
    "name": "John Doe",
    "content": "Hello world",
    "messageType": "text"
  }
}
```

---

#### 3. room_invitation
내가 방에 초대됐을 때 수신.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "room_invitation",
  "payload": {
    "roomId": "room-uuid",
    "roomName": "My Room",
    "inviterName": "Jane Doe",
    "inviteeName": "John Doe"
  }
}
```

---

#### 4. room_joined
같은 방의 멤버가 새로 입장했을 때 방 전체에 브로드캐스트.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "room_joined",
  "payload": {
    "roomId": "room-uuid",
    "roomName": "My Room",
    "inviterName": "Jane Doe",
    "newMemberName": "John Doe"
  }
}
```

---

#### 5. leave_room
같은 방의 멤버가 나갔을 때 방 전체에 브로드캐스트.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "leave_room",
  "payload": {
    "roomId": "room-uuid",
    "userId": "user-uuid",
    "name": "John Doe"
  }
}
```

---

#### 6. room_state
WebSocket 연결 시 또는 재연결 시 서버가 자동으로 전송. 이전 메시지 + 안 읽은 메시지 + 멤버 목록 포함.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "room_state",
  "payload": {
    "room": {
      "id": "room-uuid",
      "name": "My Room",
      "masterId": "user-uuid",
      "description": "Room description",
      "isPrivate": false,
      "maxUsers": 50,
      "memberCount": 5,
      "createdAt": 1708876800000,
      "updatedAt": 1708876800000
    },
    "previousMessages": [
      {
        "id": "msg-uuid",
        "content": "Hello",
        "userId": "user-uuid",
        "userName": "John Doe",
        "messageType": "text",
        "timestamp": 1708876800000,
        "isRead": true
      }
    ],
    "unreadMessages": [
      {
        "id": "msg-uuid",
        "content": "You missed this",
        "userId": "user-uuid",
        "userName": "Jane Doe",
        "messageType": "text",
        "timestamp": 1708876800000,
        "isRead": false
      }
    ],
    "members": [
      {
        "userId": "user-uuid",
        "name": "John Doe",
        "joinedAt": 1708876800000,
        "isOnline": true
      }
    ],
    "readState": {
      "lastReadTimestamp": 1708876800000,
      "unreadCount": 3,
      "totalMessages": 50
    }
  }
}
```

---

#### 7. friend_request
친구 요청 수신.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "friend_request",
  "payload": {
    "requesterId": "user-uuid",
    "requesterName": "Jane Doe",
    "addresseeId": "user-uuid",
    "addresseeEmail": "john@example.com",
    "addresseeName": "John Doe",
    "createdAt": 1708876800000
  }
}
```

---

#### 8. friend_request_response
내가 보낸 친구 요청에 대한 수락/거절 응답 수신.

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "friend_request_response",
  "payload": {
    "requestId": "request-uuid",
    "requesterId": "user-uuid",
    "requesterName": "Jane Doe",
    "addresseeId": "user-uuid",
    "addresseeName": "John Doe",
    "status": "accepted",
    "createdAt": 1708876800000,
    "acceptedAt": 1708876800000
  }
}
```

`status`: `"pending"` | `"accepted"` | `"rejected"`

---

#### 9. friend_list
친구 목록 업데이트 (친구 수락/차단/해제/삭제 시 관련 유저들에게 자동 전송).

```json
{
  "id": "uuid-v4",
  "timestamp": 1708876800000,
  "version": "1.0",
  "type": "friend_list",
  "payload": {
    "friends": [
      {
        "id": "user-uuid",
        "name": "Jane Doe",
        "email": "jane@example.com",
        "avatarUrl": "/files/avatar.png",
        "isOnline": true,
        "lastSeen": 1708876800000
      }
    ],
    "totalCount": 5,
    "updateReason": "friend_request_accepted"
  }
}
```

`updateReason`: `"friend_request_accepted"` | `"friend_blocked"` | `"friend_unblocked"` | `"friend_removed"`

---

### WebSocket Lifecycle

```
Client                          Server
  |                               |
  |--- connect (cookie) --------->|  JWT verification
  |                               |
  |<-- room_state (per room) -----|  Auto-sent on connect (session restore)
  |                               |
  |--- chat ---------------------->|  Send message
  |<-- chat (broadcast) ----------|  Broadcast to all room members
  |                               |
  |<-- ping (every 30s) ----------|  Keepalive
  |--- pong ---------------------->|
  |                               |
  |--- mark_read ----------------->|  Mark messages as read
  |                               |
  |    (disconnect)               |
  |--- close -------------------->|
```

**WebSocket Close Codes:**
- `1008` : Authentication failed — no token or invalid JWT (sent by server on connect)
- `1011` : Internal server error (sent by server on unexpected error)

---

## Notes

- All timestamps are in milliseconds (Unix timestamp)
- Room master is the user who created the room
- Friend requests are bidirectional - both users become friends when accepted
- Blocked friends cannot send messages or see each other online
- Room invitations are sent via WebSocket events to online users
- User authentication is handled via session cookies