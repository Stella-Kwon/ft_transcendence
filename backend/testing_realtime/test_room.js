#!/usr/bin/env node
// ============================================================
// test_room.js — Room HTTP API Tests
// Tests all Room endpoints: create, get, join, list, members, invite, leave
// Run: node test_room.js
// ============================================================

const https = require('https');
const assert = require('assert');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE = 'https://localhost:3000/api';
let passed = 0, failed = 0;

// ── Helpers ──────────────────────────────────────────────────

// Simple HTTPS request wrapper — returns { status, data, setCookie }
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
        // Only set Content-Type when sending a body — Fastify rejects
        // empty bodies when Content-Type: application/json is present
        ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
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

// Extracts accessToken from set-cookie header
function extractCookie(setCookie) {
  if (!setCookie) return '';
  const token = setCookie.find(c => c.startsWith('accessToken='));
  return token ? token.split(';')[0] : '';
}

// Test runner — catches assertion errors and prints pass/fail
async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     → ${e.message}`);
    failed++;
  }
}

// Section header
function section(name) {
  console.log(`\n── ${name} ──`);
}

// ── Setup ────────────────────────────────────────────────────

async function setup() {
  const ts = Date.now();
  const email = `roomtest_${ts}@test.com`;

  // Register a new test user (register auto-logs in)
  const reg = await request('POST', '/auth/register', {
    email,
    name: `Room Tester ${ts}`,
    username: `roomtest${ts}`,
    password: 'password123',
    avatarUrl: '/files/avatar.png',
  });

  if (reg.status !== 201) throw new Error(`Setup failed: register returned ${reg.status}`);

  const cookie = extractCookie(reg.setCookie);
  const userId = reg.data.id;
  return { cookie, userId, email };
}

// ── Tests ────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🚀 Room API Tests\n');

  // ── Auth Setup
  let cookie, userId;
  try {
    ({ cookie, userId } = await setup());
    console.log(`  ✅ Setup — user created (${userId})`);
  } catch (e) {
    console.log(`  ❌ Setup failed: ${e.message}`);
    process.exit(1);
  }

  let roomId; // reused across tests

  // ────────────────────────────────────────────────────────────
  section('Create Room  POST /rooms');

  await test('Valid room creation returns 201 with id', async () => {
    const res = await request('POST', '/realtime/rooms', {
      name: 'Test Room', description: 'A test room', isPrivate: false, maxUsers: 10,
    }, cookie);
    assert.equal(res.status, 201, `Expected 201, got ${res.status}`);
    assert.ok(res.data.id, 'Response should include id');
    assert.equal(res.data.isPrivate, false);
    roomId = res.data.id; // save for later tests
  });

  await test('Private room creation returns isPrivate:true', async () => {
    const res = await request('POST', '/realtime/rooms', {
      name: 'Private Room', isPrivate: true, maxUsers: 5,
    }, cookie);
    assert.equal(res.status, 201);
    assert.equal(res.data.isPrivate, true);
  });

  await test('No auth → 401', async () => {
    const res = await request('POST', '/realtime/rooms', {
      name: 'Unauth Room', isPrivate: false, maxUsers: 10,
    }); // no cookie
    assert.equal(res.status, 401);
  });

  await test('Empty name → 400 validation error', async () => {
    const res = await request('POST', '/realtime/rooms', {
      name: '', isPrivate: false, maxUsers: 10,
    }, cookie);
    assert.equal(res.status, 400);
  });

  await test('Missing required name field → 400', async () => {
    const res = await request('POST', '/realtime/rooms', {
      description: 'no name', isPrivate: false, maxUsers: 10,
    }, cookie);
    assert.equal(res.status, 400);
  });

  // ────────────────────────────────────────────────────────────
  section('Get Room  GET /rooms/:roomId');

  await test('Get existing room returns 200 with room data', async () => {
    const res = await request('GET', `/realtime/rooms/${roomId}`, null, cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.id, roomId);
    assert.ok(res.data.name);
    assert.ok(res.data.masterId);
  });

  await test('Get non-existent room → 404', async () => {
    const res = await request('GET', '/realtime/rooms/invalid-uuid', null, cookie);
    assert.equal(res.status, 404);
  });

  await test('No auth → 401', async () => {
    const res = await request('GET', `/realtime/rooms/${roomId}`);
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Join Room  POST /rooms/:roomId/join');

  await test('Join own room returns 200 with messages and unreadCount', async () => {
    // Create a new room and join it (creator is already a member)
    const created = await request('POST', '/realtime/rooms', {
      name: 'Join Test Room', isPrivate: false, maxUsers: 10,
    }, cookie);
    const jRoomId = created.data.id;

    const res = await request('POST', `/realtime/rooms/${jRoomId}/join`, null, cookie);
    assert.equal(res.status, 200);
    assert.ok(res.data.room, 'Response should include room object');
    assert.ok(Array.isArray(res.data.messages), 'messages should be an array');
    assert.ok(typeof res.data.unreadCount === 'number', 'unreadCount should be a number');
  });

  await test('Join non-existent room → 403 or 404', async () => {
    const res = await request('POST', '/realtime/rooms/invalid-uuid/join', null, cookie);
    assert.ok([403, 404].includes(res.status), `Expected 403 or 404, got ${res.status}`);
  });

  await test('No auth → 401', async () => {
    const res = await request('POST', `/realtime/rooms/${roomId}/join`);
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Room List  GET /rooms/:userId/roomlist');

  await test('Get own room list returns 200 with roomList array', async () => {
    const res = await request('GET', `/realtime/rooms/${userId}/roomlist`, null, cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.roomList), 'roomList should be an array');
  });

  await test('Each room in list includes unreadCount field', async () => {
    const res = await request('GET', `/realtime/rooms/${userId}/roomlist`, null, cookie);
    assert.equal(res.status, 200);
    res.data.roomList.forEach(room => {
      assert.ok(typeof room.unreadCount === 'number', `Room ${room.id} missing unreadCount`);
    });
  });

  await test('Access other user room list → 403', async () => {
    // Register a second user
    const ts2 = Date.now();
    const reg2 = await request('POST', '/auth/register', {
      email: `roomtest2_${ts2}@test.com`,
      name: `Room Tester 2 ${ts2}`,
      username: `roomtest2${ts2}`,
      password: 'password123',
      avatarUrl: '/files/avatar.png',
    });
    const cookie2 = extractCookie(reg2.setCookie);

    // user2 tries to access user1's room list
    const res = await request('GET', `/realtime/rooms/${userId}/roomlist`, null, cookie2);
    assert.equal(res.status, 403);
  });

  await test('No auth → 401', async () => {
    const res = await request('GET', `/realtime/rooms/${userId}/roomlist`);
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Room Members  GET /rooms/:roomId/members');

  await test('Get members returns array with userId and isOnline fields', async () => {
    const res = await request('GET', `/realtime/rooms/${roomId}/members`, null, cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'Response should be an array');
    assert.ok(res.data.length > 0, 'Room should have at least 1 member');
    assert.ok(res.data[0].userId, 'Member should have userId');
    assert.ok(typeof res.data[0].isOnline === 'boolean', 'Member should have isOnline');
    assert.ok(typeof res.data[0].joinedAt === 'number', 'joinedAt should be a timestamp (number)');
  });

  await test('Non-existent room → 404', async () => {
    const res = await request('GET', '/realtime/rooms/invalid-uuid/members', null, cookie);
    assert.equal(res.status, 404);
  });

  // ────────────────────────────────────────────────────────────
  section('Invite to Room  POST /rooms/:roomId/invite');

  await test('Invite with empty list → 200 with success/failed arrays', async () => {
    const res = await request('POST', `/realtime/rooms/${roomId}/invite`, {
      inviteeNames: [],
    }, cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data.success));
    assert.ok(Array.isArray(res.data.failed));
  });

  await test('Invite to non-existent room → 404', async () => {
    const res = await request('POST', '/realtime/rooms/invalid-uuid/invite', {
      inviteeNames: ['someuser'],
    }, cookie);
    assert.equal(res.status, 404);
  });

  await test('No auth → 401', async () => {
    const res = await request('POST', `/realtime/rooms/${roomId}/invite`, {
      inviteeNames: ['someuser'],
    });
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Leave Room  POST /rooms/:roomId/leave');

  await test('Leave room returns success:true', async () => {
    // Create a fresh room to leave
    const created = await request('POST', '/realtime/rooms', {
      name: 'Leave Test Room', isPrivate: false, maxUsers: 10,
    }, cookie);
    const leaveRoomId = created.data.id;

    const res = await request('POST', `/realtime/rooms/${leaveRoomId}/leave`, null, cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
    assert.ok(res.data.message);
  });

  await test('Leave non-existent room → 404', async () => {
    const res = await request('POST', '/realtime/rooms/invalid-uuid/leave', null, cookie);
    assert.equal(res.status, 404);
  });

  await test('No auth → 401', async () => {
    const res = await request('POST', `/realtime/rooms/${roomId}/leave`);
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────

  // Results
  console.log('\n' + '─'.repeat(40));
  console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('─'.repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
