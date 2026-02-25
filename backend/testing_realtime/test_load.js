#!/usr/bin/env node
// ============================================================
// test_load.js — Server Load & Stress Tests
// Tests:
//   1. Rapid parallel room creation  (10 rooms simultaneously)
//   2. High-volume WebSocket messaging (50 chat messages)
//   3. Rapid ping bursts             (10 pings at once)
//   4. Concurrent WebSocket connections (5 users simultaneously)
//   5. Sequential HTTP request burst (50 GET requests in a row)
// Run: node test_load.js
// Note: requires the 'ws' package  →  npm install ws
// ============================================================

const https  = require('https');
const WebSocket = require('ws');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const WS_URL = 'wss://localhost:3000/api/realtime/ws';
let passed = 0, failed = 0;

// ── Helpers ──────────────────────────────────────────────────

function request(method, path, body = null, cookie = '') {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api${path}`,
      method,
      rejectUnauthorized: false,
      headers: {
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch { data = raw; }
        resolve({ status: res.statusCode, data, setCookie: res.headers['set-cookie'] });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractCookie(setCookie) {
  if (!setCookie) return '';
  const token = setCookie.find(c => c.startsWith('accessToken='));
  return token ? token.split(';')[0] : '';
}

async function registerUser(label) {
  const ts = Date.now();
  const r  = Math.floor(Math.random() * 99999);
  const email = `load_${label}_${ts}_${r}@test.com`;
  const res = await request('POST', '/auth/register', {
    email,
    name:     `Load ${label} ${ts}`,
    username: `load${label}${ts}${r}`,
    password: 'password123',
    avatarUrl: '/files/avatar.png',
  });
  if (res.status !== 201)
    throw new Error(`Register failed (${res.status}): ${JSON.stringify(res.data)}`);
  return { cookie: extractCookie(res.setCookie), userId: res.data.id };
}

// Print test result and track pass/fail
async function test(name, fn) {
  try {
    const note = await fn();
    console.log(`  ✅ ${name}${note ? `  — ${note}` : ''}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n── ${name} ──`);
}

// Open a WebSocket connection authenticated with cookie
function connectWS(cookie) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, {
      rejectUnauthorized: false,
      headers: { Cookie: cookie },
    });
    const timer = setTimeout(() => reject(new Error('WS connect timeout')), 8000);
    ws.on('open',  () => { clearTimeout(timer); resolve(ws); });
    ws.on('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

// Collect `count` messages of a specific type from a WebSocket
function collectMessages(ws, type, count, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const collected = [];
    const timer = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`Got only ${collected.length}/${count} '${type}' messages`));
    }, timeout);

    function handler(data) {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type === type) {
        collected.push(msg);
        if (collected.length >= count) {
          clearTimeout(timer);
          ws.removeListener('message', handler);
          resolve(collected);
        }
      }
    }
    ws.on('message', handler);
  });
}

// Send a chat message over WebSocket
function sendChat(ws, roomId, userId, content) {
  ws.send(JSON.stringify({
    type: 'chat',
    payload: { roomId, userId, name: 'Load Tester', content, messageType: 'text' },
  }));
}

// ── Tests ────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🚀 Server Load & Stress Tests\n');

  // ── Setup: register one main HTTP user
  let main;
  try {
    main = await registerUser('main');
    console.log(`  ✅ Setup — main user (${main.userId})`);
  } catch (e) {
    console.log(`  ❌ Setup failed: ${e.message}`);
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────
  section('1. Rapid Parallel Room Creation');

  // Fire 10 room-creation requests simultaneously and verify every one returns 201
  await test('Create 10 rooms in parallel — all return 201', async () => {
    const N = 10;
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        request('POST', '/realtime/rooms', {
          name:      `Load Room ${i + 1} ${Date.now()}`,
          isPrivate: false,
          maxUsers:  10,
        }, main.cookie)
      )
    );
    const bad = results.filter(r => r.status !== 201);
    if (bad.length > 0)
      throw new Error(`${bad.length}/${N} room creations failed (statuses: ${bad.map(r => r.status)})`);
    return `${N}/${N} created`;
  });

  // ────────────────────────────────────────────────────────────
  section('2. High-Volume WebSocket Messaging');

  // Each WebSocket test needs its own user + room to avoid state conflicts
  let wsUser, ws, testRoomId;
  try {
    wsUser = await registerUser('ws');
    const roomRes = await request('POST', '/realtime/rooms', {
      name:      `Load WS Room ${Date.now()}`,
      isPrivate: false,
      maxUsers:  100,
    }, wsUser.cookie);
    testRoomId = roomRes.data.id;
    ws = await connectWS(wsUser.cookie);
    console.log(`  ✅ WS setup — user=${wsUser.userId}  room=${testRoomId}`);
  } catch (e) {
    console.log(`  ❌ WS setup failed: ${e.message}`);
    ws = null;
  }

  if (ws) {
    // Send 50 chat messages and confirm all 50 are broadcast back
    await test('Send 50 chat messages — all broadcast back', async () => {
      const N = 50;
      const collectPromise = collectMessages(ws, 'chat', N, 20000);

      // Stagger sends 20 ms apart to avoid socket overload
      for (let i = 0; i < N; i++) {
        await new Promise(r => setTimeout(r, 20));
        sendChat(ws, testRoomId, wsUser.userId, `Load message ${i + 1}`);
      }

      const msgs = await collectPromise;
      return `${msgs.length}/${N} messages received`;
    });

    // Burst 10 pings simultaneously and confirm 10 pongs arrive
    await test('10 rapid pings — all receive pong', async () => {
      const N = 10;
      const collectPromise = collectMessages(ws, 'pong', N, 10000);
      for (let i = 0; i < N; i++) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
      const pongs = await collectPromise;
      return `${pongs.length}/${N} pongs received`;
    });

    ws.close();
  }

  // ────────────────────────────────────────────────────────────
  section('3. Concurrent WebSocket Connections');

  // Open 5 connections at the same time and ping each one
  await test('5 concurrent connections — all open and respond to ping', async () => {
    const N = 5;

    // Register 5 fresh users in parallel
    const users = await Promise.all(
      Array.from({ length: N }, (_, i) => registerUser(`con${i}`))
    );

    // Connect all 5 WebSockets simultaneously
    const sockets = await Promise.all(users.map(u => connectWS(u.cookie)));

    const openCount = sockets.filter(s => s.readyState === WebSocket.OPEN).length;
    if (openCount !== N)
      throw new Error(`Only ${openCount}/${N} sockets are open`);

    // Drain the initial 'friend_list' message the server sends on connect.
    // This prevents the friend_list from being processed while we're
    // waiting for pong, which could cause a missed-message race condition.
    await Promise.all(
      sockets.map(s => collectMessages(s, 'friend_list', 1, 3000).catch(() => {}))
    );

    // Send ping on every socket and wait for all pongs (10 s timeout each)
    const pongPromises = sockets.map(s => collectMessages(s, 'pong', 1, 10000));
    sockets.forEach(s => s.send(JSON.stringify({ type: 'ping' })));
    await Promise.all(pongPromises);

    sockets.forEach(s => s.close());
    return `${openCount}/${N} connections active, all responded to ping`;
  });

  // ────────────────────────────────────────────────────────────
  section('4. Sequential HTTP Request Burst');

  // Create one room and GET it 50 times in a row to check server stability
  await test('50 sequential GET /rooms/:id — all return 200', async () => {
    const N = 50;
    const roomRes = await request('POST', '/realtime/rooms', {
      name:      `Burst Test Room ${Date.now()}`,
      isPrivate: false,
      maxUsers:  10,
    }, main.cookie);
    const burstRoomId = roomRes.data.id;

    let ok = 0;
    for (let i = 0; i < N; i++) {
      const res = await request('GET', `/realtime/rooms/${burstRoomId}`, null, main.cookie);
      if (res.status === 200) ok++;
    }
    if (ok !== N)
      throw new Error(`Only ${ok}/${N} requests returned 200`);
    return `${ok}/${N} OK`;
  });

  // ────────────────────────────────────────────────────────────
  section('5. 1000 Concurrent WebSocket Connections');

  // Register 1000 users in batches, then open all 1000 WebSocket connections
  // simultaneously to simulate 1000 users online at the same time.
  await test('1000 users connect simultaneously — track success rate', async () => {
    const N    = 1000;
    const BATCH = 50; // register 50 users at a time to avoid HTTP overload

    // ── Step 1: register N users in batches ──
    process.stdout.write(`     Registering ${N} users (batches of ${BATCH})...`);
    const users = [];
    for (let i = 0; i < N; i += BATCH) {
      const batchSize = Math.min(BATCH, N - i);
      const batch = await Promise.all(
        Array.from({ length: batchSize }, (_, j) => registerUser(`k${i + j}`))
      );
      users.push(...batch);
      process.stdout.write(`\r     Registered ${users.length}/${N} users...   `);
    }
    console.log(`\r     Registered ${N}/${N} users ✓                  `);

    // ── Step 2: open all 1000 WebSocket connections simultaneously ──
    process.stdout.write(`     Opening ${N} WebSocket connections...`);
    const start = Date.now();

    // Promise.allSettled so a single failure doesn't abort everything
    const results = await Promise.allSettled(users.map(u => connectWS(u.cookie)));

    const sockets   = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const failures  = results.filter(r => r.status === 'rejected').length;
    const openCount = sockets.filter(s => s.readyState === WebSocket.OPEN).length;
    const elapsed   = ((Date.now() - start) / 1000).toFixed(1);

    console.log(`\r     ${openCount}/${N} connections open in ${elapsed}s (${failures} failed)   `);

    // ── Step 3: close all connections ──
    sockets.forEach(s => s.close());

    // Allow up to 5% failure (network/OS limits can cause a few drops)
    if (openCount < N * 0.95)
      throw new Error(`Too many failures: only ${openCount}/${N} connected`);

    return `${openCount}/${N} connections in ${elapsed}s`;
  });

  // ────────────────────────────────────────────────────────────

  // Results
  console.log('\n' + '─'.repeat(40));
  console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('─'.repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
