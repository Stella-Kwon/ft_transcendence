# ft_transcendence

**Real-time multiplayer Pong** with user accounts, tournaments, live chat, and social features — a full-stack project built at Hive Helsinki.

---

## Overview

| | |
|---|---|
| **Frontend** | React 18, React Router 7, Vite, TypeScript, Tailwind CSS, Babylon.js (3D/WebGL game), Zustand, i18next (EN/FI/ES) |
| **Backend** | Fastify, TypeScript, MikroORM (SQLite), JWT + HttpOnly cookies, WebSockets |
| **Auth** | Email/password, Google OAuth 2.0, Two-Factor Authentication (TOTP) |
| **Real-time** | WebSocket-based chat (rooms, DMs), presence |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                         │
│  • SPA with React Router  • Babylon.js game loop  • Zustand      │
│  • WebSocket client (chat, presence)  • REST (auth, users, stats)│
└───────────────────────────────┬──────────────────────────────────┘
                                │ HTTPS / WSS
┌───────────────────────────────▼──────────────────────────────────────┐
│  Backend (Fastify)                                                   │
│  • REST API (auth, users, stats, tournaments, media)                 │
│  • WebSocket server (realtime: chat, rooms, presence, friends, sync) │
│  • MikroORM + SQLite  • TypeBox schemas  • Modular structure         │
└──────────────────────────────────────────────────────────────────────┘
```

Backend code is split into modules by feature:
**auth** (login, 2FA)
**user** (profile)
**realtime** (chat, rooms, presence, friends)
**tournament**, **stats**, **gameHistory**, **media**.
Shared **database** and **config** are used across them.

---

## Features

- **Authentication** — Registration, login, JWT in HttpOnly cookies, Google sign-in, 2FA (TOTP with QR code).
- **Users & profile** — Display name, avatar upload, profile update, match history and stats.
- **Social** — Friends list, friend requests, online/offline presence over WebSocket.
- **Game** — 1v1 Pong (Babylon.js), ELO-style rating, leaderboards, match history with dates and outcomes.
- **Tournaments** — Bracket creation, join flow, game scheduling.
- **Chat** — Rooms and DMs over WebSocket, message history, read receipts, room moderation.
- **i18n** — English, Finnish, Spanish (i18next).

---

## Quick start

**Prerequisites:** Docker, Docker Compose.

**1. Environment**

Copy each `.env.example` to `.env` (do not commit `.env`), then set the values:

```bash
cp backend/.env.example backend/.env
# Set: COOKIE_SECRET, JWT_SECRET, GOOGLE_CLIENT_ID

cp frontend/.env.example frontend/.env
# Set: VITE_API_BASE_URL=https://localhost:3000, VITE_GOOGLE_CLIENT_ID
```

Create an OAuth 2.0 Web client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials); use the **Client ID** in both backend and frontend. Add `https://localhost:5173` as an authorized JavaScript origin.

**2. Run with Docker**

```bash
make up
```

- Backend: `https://localhost:3000`
- Frontend: `https://localhost:5173`

SSL certificates are generated automatically on first run. The browser will show a self-signed certificate warning — accept it once for both ports.

To stop:

```bash
make down
```

---

## Project structure (high level)

```
backend/
  src/
    main.ts, app.ts, app.module.ts
    modules/          # Domain modules
      auth/           # Login, register, JWT, 2FA, Google
      user/           # Profile, CRUD
      realtime/       # WebSocket: chat, rooms, presence, friends, sync
      tournament/     # Brackets, matches
      stats/          # Ratings, leaderboard
      gameHistory/    # Match records
      media/          # File upload
    common/           # Exceptions, DTOs, CryptoService
    config/
frontend/
  app/
    routes/           # React Router pages
    components/       # Shared UI, forms, chat
    game/             # Babylon.js scene, ball/paddle logic
    api/              # REST client, auth, stats, etc.
    stores/           # Zustand (auth, chat, tournament, etc.)
```

---

## Testing

All tests live in `backend/testing_realtime/`. The server must be running (`make up`) before running them.

```bash
node backend/testing_realtime/test_room.js        # Room HTTP API
node backend/testing_realtime/test_friendship.js  # Friendship HTTP API
node backend/testing_realtime/websocket_test.js   # WebSocket functional tests
node backend/testing_realtime/test_load.js        # Load & stress tests
```

**`test_room.js`** — Room CRUD, join/leave/invite, room list with unread counts, member list, auth checks (401/403/404)

**`test_friendship.js`** — 4-user scenario: send requests, accept/reject, friends list, block/unblock, remove, error cases (duplicate, self-request, non-existent user)

**`websocket_test.js`** — WebSocket connect with cookie auth, ping/pong, room sync (`room_state`), chat broadcast, mark read, error handling, connection persistence

**`test_load.js`** — 10 parallel room creations, 50-message WebSocket burst, 10 rapid pings, 5 concurrent connections, 50 sequential HTTP requests, **1000 concurrent WebSocket connections**

---

## License

MIT — Copyright (c) 2025 Hoang Tran, Alice Li Maunumäki, Timo Saari, Joseph Lu, Stella-Kwon.

---

*Final group project version (archived 2025-08-01).*
