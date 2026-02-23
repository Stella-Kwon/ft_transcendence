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
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (React + Vite)                                         │
│  • SPA with React Router  • Babylon.js game loop  • Zustand      │
│  • WebSocket client (chat, presence)  • REST (auth, users, stats) │
└───────────────────────────────┬─────────────────────────────────┘
                                │ HTTP / WebSocket
┌───────────────────────────────▼─────────────────────────────────┐
│  Backend (Fastify)                                               │
│  • REST API (auth, users, stats, tournaments, media)             │
│  • WebSocket server (realtime: chat, rooms, presence, room sync)  │
│  • MikroORM + SQLite  • TypeBox schemas  • Modular structure     │
└─────────────────────────────────────────────────────────────────┘
```

Backend is organized by domain: **auth**, **user**, **realtime** (chat, rooms, presence), **tournament**, **stats**, **gameHistory**, **media**, with shared **database** and **config**.

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

**Prerequisites:** Node.js LTS, npm (or pnpm).

```bash
git clone <repo-url>
cd <repo-dir>
npm install --prefix backend && npm install --prefix frontend
```

**1. Environment**

Copy each `.env.example` to `.env` (do not commit `.env`), then set the values:

```bash
# Backend: .env.example → .env
cp backend/.env.example backend/.env
# Set: COOKIE_SECRET, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET

# Frontend: .env.example → .env
cp frontend/.env.example frontend/.env
# Set: VITE_API_BASE_URL=http://localhost:3000, VITE_GOOGLE_CLIENT_ID
```

Create an OAuth 2.0 Web client in [Google Cloud Console](https://console.cloud.google.com/apis/credentials); use Client ID in both apps, Client Secret only in the backend.

**2a. Run locally (no Docker)**

```bash
# Database (only when not using Docker)
cd backend && npm run migration:up && cd ..

# Terminal 1 – backend
cd backend && npm run dev

# Terminal 2 – frontend
cd frontend && npm run dev
```

Open the URL from the frontend dev server (e.g. `http://localhost:5173`).

**2b. Run with Docker**

Backend container runs migrations on startup. Ensure both `backend/.env` and `frontend/.env` exist, then:

```bash
docker-compose up --build
```

Backend: `https://localhost:3000` · Frontend: `http://localhost:5173`

---

## Project structure (high level)

```
backend/
  src/
    main.ts, app.ts, app.module.ts
    modules/          # Domain modules
      auth/           # Login, register, JWT, 2FA, Google
      user/           # Profile, CRUD
      realtime/       # WebSocket: chat, rooms, presence, sync
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

## License

MIT — Copyright (c) 2025 Hoang Tran, Alice Li Maunumäki, Timo Saari, Joseph Lu, Stella-Kwon.

---

*Final group project version (archived 2025-08-01).*
