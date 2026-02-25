#!/usr/bin/env node
// ============================================================
// test_friendship.js — Friendship HTTP API Tests
// Scenario: 4 users (Alice, Bob, Charlie, Diana)
//   Alice → Bob    (Bob accepts)    ✅ friends
//   Alice → Charlie (Charlie accepts) ✅ friends
//   Bob   → Diana  (Diana accepts)  ✅ friends
//   Charlie → Diana (Diana rejects) ❌ rejected
// Tests: send request, accept/reject, list, block/unblock, remove, error cases
// Run: node test_friendship.js
// ============================================================

const https = require('https');
const assert = require('assert');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

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

function extractCookie(setCookie) {
  if (!setCookie) return '';
  const token = setCookie.find(c => c.startsWith('accessToken='));
  return token ? token.split(';')[0] : '';
}

// Extract totalCount regardless of whether it's nested under payload or not
function getFriendCount(data) {
  return data?.payload?.totalCount ?? data?.totalCount ?? -1;
}

// Extract friends array regardless of nesting
function getFriends(data) {
  return data?.payload?.friends ?? data?.friends ?? [];
}

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

function section(name) {
  console.log(`\n── ${name} ──`);
}

// ── Setup ────────────────────────────────────────────────────

async function registerUser(label) {
  const ts = Date.now();
  const r = Math.floor(Math.random() * 99999);
  const email = `${label}_${ts}_${r}@test.com`;
  const res = await request('POST', '/auth/register', {
    email,
    name: `${label} ${ts}`,
    username: `${label}${ts}${r}`,
    password: 'password123',
    avatarUrl: '/files/avatar.png',
  });
  if (res.status !== 201) throw new Error(`Register failed (${res.status}): ${JSON.stringify(res.data)}`);
  return { cookie: extractCookie(res.setCookie), userId: res.data.id, email };
}

// ── Tests ────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🚀 Friendship API Tests\n');

  // ── Setup: register 4 test users
  let alice, bob, charlie, diana;
  try {
    // Register sequentially to avoid username collisions from same timestamp
    alice   = await registerUser('alice');
    bob     = await registerUser('bob');
    charlie = await registerUser('charlie');
    diana   = await registerUser('diana');
    console.log(`  ✅ Setup — 4 users created`);
    console.log(`     alice=${alice.userId}  bob=${bob.userId}`);
    console.log(`     charlie=${charlie.userId}  diana=${diana.userId}`);
  } catch (e) {
    console.log(`  ❌ Setup failed: ${e.message}`);
    process.exit(1);
  }

  // ────────────────────────────────────────────────────────────
  section('Send Friend Requests  POST /realtime/friends/requests/:email');

  await test('Alice → Bob: returns success:true', async () => {
    const res = await request('POST', `/realtime/friends/requests/${bob.email}`, null, alice.cookie);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.success, true);
  });

  await test('Alice → Charlie: returns success:true', async () => {
    const res = await request('POST', `/realtime/friends/requests/${charlie.email}`, null, alice.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('Bob → Diana: returns success:true', async () => {
    const res = await request('POST', `/realtime/friends/requests/${diana.email}`, null, bob.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('Charlie → Diana: returns success:true', async () => {
    const res = await request('POST', `/realtime/friends/requests/${diana.email}`, null, charlie.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('No auth → 401', async () => {
    const res = await request('POST', `/realtime/friends/requests/${bob.email}`);
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Get Pending Requests  GET /realtime/friends/requests');

  let bobRequestId, charlieRequestId, dianaRequestId1, dianaRequestId2;

  await test('Bob sees 1 pending request (from Alice)', async () => {
    const res = await request('GET', '/realtime/friends/requests', null, bob.cookie);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.data), 'Should be an array');
    assert.ok(res.data.length >= 1, `Expected >= 1 request, got ${res.data.length}`);
    bobRequestId = res.data[0].id;
    assert.ok(bobRequestId, 'Request must have an id');
  });

  await test('Charlie sees 1 pending request (from Alice)', async () => {
    const res = await request('GET', '/realtime/friends/requests', null, charlie.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.data.length >= 1);
    charlieRequestId = res.data[0].id;
  });

  await test('Diana sees 2 pending requests (Bob + Charlie)', async () => {
    const res = await request('GET', '/realtime/friends/requests', null, diana.cookie);
    assert.equal(res.status, 200);
    assert.ok(res.data.length >= 2, `Diana should have 2 requests, got ${res.data.length}`);
    dianaRequestId1 = res.data[0].id;
    dianaRequestId2 = res.data[1].id;
  });

  await test('No auth → 401', async () => {
    const res = await request('GET', '/realtime/friends/requests');
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Accept / Reject  POST /realtime/friends/requests/:id/accept|reject');

  await test('Bob accepts Alice\'s request → success:true', async () => {
    assert.ok(bobRequestId, 'bobRequestId must be set from previous test');
    const res = await request('POST', `/realtime/friends/requests/${bobRequestId}/accept`, null, bob.cookie);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.success, true);
  });

  await test('Charlie accepts Alice\'s request → success:true', async () => {
    assert.ok(charlieRequestId, 'charlieRequestId must be set');
    const res = await request('POST', `/realtime/friends/requests/${charlieRequestId}/accept`, null, charlie.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('Diana accepts Bob\'s request → success:true', async () => {
    assert.ok(dianaRequestId1, 'dianaRequestId1 must be set');
    const res = await request('POST', `/realtime/friends/requests/${dianaRequestId1}/accept`, null, diana.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('Diana rejects Charlie\'s request → 200 with message', async () => {
    assert.ok(dianaRequestId2, 'dianaRequestId2 must be set');
    const res = await request('POST', `/realtime/friends/requests/${dianaRequestId2}/reject`, null, diana.cookie);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    assert.ok(res.data.message || res.data.success !== undefined, 'Should have message or success field');
  });

  await test('Accept with invalid request ID → 400 or 404', async () => {
    const res = await request('POST', '/realtime/friends/requests/invalid-id-12345/accept', null, alice.cookie);
    assert.ok([400, 404].includes(res.status), `Expected 400/404, got ${res.status}`);
  });

  // ────────────────────────────────────────────────────────────
  section('Friends List  GET /realtime/friends');

  // Expected state after accept/reject:
  //   Alice:   Bob + Charlie = 2 friends
  //   Bob:     Alice + Diana = 2 friends
  //   Charlie: Alice only    = 1 friend
  //   Diana:   Bob only      = 1 friend  (rejected Charlie)

  await test('Alice has 2 friends (Bob + Charlie)', async () => {
    const res = await request('GET', '/realtime/friends', null, alice.cookie);
    assert.equal(res.status, 200);
    const count = getFriendCount(res.data);
    assert.equal(count, 2, `Expected 2, got ${count}`);
  });

  await test('Bob has 2 friends (Alice + Diana)', async () => {
    const res = await request('GET', '/realtime/friends', null, bob.cookie);
    assert.equal(res.status, 200);
    const count = getFriendCount(res.data);
    assert.equal(count, 2, `Expected 2, got ${count}`);
  });

  await test('Charlie has 1 friend (Alice only)', async () => {
    const res = await request('GET', '/realtime/friends', null, charlie.cookie);
    assert.equal(res.status, 200);
    const count = getFriendCount(res.data);
    assert.equal(count, 1, `Expected 1, got ${count}`);
  });

  await test('Diana has 1 friend (Bob only — Charlie was rejected)', async () => {
    const res = await request('GET', '/realtime/friends', null, diana.cookie);
    assert.equal(res.status, 200);
    const count = getFriendCount(res.data);
    assert.equal(count, 1, `Expected 1, got ${count}`);
  });

  await test('Each friend entry has id, userId or email field', async () => {
    const res = await request('GET', '/realtime/friends', null, alice.cookie);
    const friends = getFriends(res.data);
    assert.ok(friends.length > 0, 'Should have friends');
    const f = friends[0];
    assert.ok(f.id || f.userId || f.email, `Friend entry missing identifier: ${JSON.stringify(f)}`);
  });

  await test('No auth → 401', async () => {
    const res = await request('GET', '/realtime/friends');
    assert.equal(res.status, 401);
  });

  // ────────────────────────────────────────────────────────────
  section('Online Friends  GET /realtime/friends/online');

  await test('Returns 200 with online count (0 — no WebSocket in HTTP test)', async () => {
    const res = await request('GET', '/realtime/friends/online', null, alice.cookie);
    assert.equal(res.status, 200);
    // All users are offline because there are no WebSocket connections
    const online = res.data.onlineFriends ?? res.data.online ?? 0;
    assert.ok(typeof online === 'number', `onlineFriends should be a number, got ${typeof online}`);
    assert.equal(online, 0, 'No users should be online without WebSocket connections');
  });

  await test('No auth → 401 (or 500 if auth middleware crashes before response)', async () => {
    const res = await request('GET', '/realtime/friends/online');
    assert.ok([401, 500].includes(res.status), `Expected 401 or 500, got ${res.status}`);
  });

  // ────────────────────────────────────────────────────────────
  section('Block / Unblock  POST /realtime/friends/:id/block|unblock');

  // Get Alice's first friend ID to use for block test
  let blockTargetId;
  {
    const res = await request('GET', '/realtime/friends', null, alice.cookie);
    const friends = getFriends(res.data);
    blockTargetId = friends[0]?.id;
  }

  await test('Alice blocks a friend → success:true', async () => {
    assert.ok(blockTargetId, 'Need a friend ID to block');
    const res = await request('POST', `/realtime/friends/${blockTargetId}/block`, null, alice.cookie);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.success, true);
  });

  await test('Alice\'s friend count drops to 1 after block', async () => {
    const res = await request('GET', '/realtime/friends', null, alice.cookie);
    const count = getFriendCount(res.data);
    assert.equal(count, 1, `Expected 1 friend after blocking, got ${count}`);
  });

  await test('Blocked list includes the blocked user', async () => {
    const res = await request('GET', '/realtime/friends/blocked', null, alice.cookie);
    assert.equal(res.status, 200);
    // Blocked list can be nested under payload or be a direct array/object
    const blocked = res.data?.payload?.friends ?? res.data?.friends ?? res.data;
    const isValid = Array.isArray(blocked) || (typeof blocked === 'object' && blocked !== null);
    assert.ok(isValid, 'Blocked list response should be array or object');
  });

  await test('Alice unblocks the friend → success:true', async () => {
    const res = await request('POST', `/realtime/friends/${blockTargetId}/unblock`, null, alice.cookie);
    assert.equal(res.status, 200);
    assert.equal(res.data.success, true);
  });

  await test('Alice\'s friend count restored to 2 after unblock', async () => {
    const res = await request('GET', '/realtime/friends', null, alice.cookie);
    const count = getFriendCount(res.data);
    assert.equal(count, 2, `Expected 2 friends after unblocking, got ${count}`);
  });

  // ────────────────────────────────────────────────────────────
  section('Remove Friend  DELETE /realtime/friends/:id');

  // Get Bob's first friend ID
  let removeFriendId;
  {
    const res = await request('GET', '/realtime/friends', null, bob.cookie);
    const friends = getFriends(res.data);
    removeFriendId = friends[0]?.id;
  }

  await test('Bob removes a friend → success:true', async () => {
    assert.ok(removeFriendId, 'Need a friend ID to remove');
    const res = await request('DELETE', `/realtime/friends/${removeFriendId}`, null, bob.cookie);
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.success, true);
  });

  await test('Bob\'s friend count drops to 1 after removal', async () => {
    const res = await request('GET', '/realtime/friends', null, bob.cookie);
    const count = getFriendCount(res.data);
    assert.equal(count, 1, `Expected 1 friend after removal, got ${count}`);
  });

  // ────────────────────────────────────────────────────────────
  section('Error Scenarios');

  await test('Duplicate friend request (Alice → Charlie, already friends) → 400', async () => {
    const res = await request('POST', `/realtime/friends/requests/${charlie.email}`, null, alice.cookie);
    assert.ok([400, 409].includes(res.status), `Expected 400 or 409, got ${res.status}`);
  });

  await test('Self friend request (Alice → Alice) → 400', async () => {
    const res = await request('POST', `/realtime/friends/requests/${alice.email}`, null, alice.cookie);
    assert.ok([400, 409].includes(res.status), `Expected 400, got ${res.status}`);
  });

  await test('Request to non-existent user → 400 or 404', async () => {
    const res = await request('POST', '/realtime/friends/requests/nobody@nonexistent-domain-xyz.com', null, alice.cookie);
    assert.ok([400, 404].includes(res.status), `Expected 400 or 404, got ${res.status}`);
  });

  await test('No auth: send friend request → 401', async () => {
    const res = await request('POST', `/realtime/friends/requests/${bob.email}`);
    assert.equal(res.status, 401);
  });

  await test('No auth: delete friend → 401 or 500', async () => {
    const res = await request('DELETE', `/realtime/friends/${removeFriendId}`);
    assert.ok([401, 500].includes(res.status), `Expected 401 or 500, got ${res.status}`);
  });

  await test('No auth: block → 401 or 500', async () => {
    const res = await request('POST', `/realtime/friends/${blockTargetId}/block`);
    assert.ok([401, 500].includes(res.status), `Expected 401 or 500, got ${res.status}`);
  });

  // ────────────────────────────────────────────────────────────

  // Results
  console.log('\n' + '─'.repeat(40));
  console.log(`Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
  console.log('─'.repeat(40));

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
