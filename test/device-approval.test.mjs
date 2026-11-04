import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceHandler } from '../api/device.js';
import { createNotesHandler } from '../api/notes.js';
import { createRestoreHandler, contentHash } from '../api/restore-note.js';

const user = { kind: 'student', userId: '00000000-0000-4000-8000-000000000001', sessionId: '00000000-0000-4000-8000-000000000002' };
const note = { public_id: '00000000-0000-4000-8000-000000000003', owner_id: user.userId, title: 'synthetic', content: 'fixture only' };
function fixture() {
  const state = { status: 'not_requested', accesses: 0, fail: false, rpcCalls: [] };
  const client = {
    async rpc(name, args) {
      assert.equal(name, 'vault_device_access');
      state.rpcCalls.push(args);
      assert.equal(args.p_user, user.userId);
      assert.equal(args.p_session, user.sessionId);
      if (state.fail) return { error: { message: 'synthetic failure' } };
      if (args.p_request && state.status === 'not_requested') state.status = 'pending';
      return { data: { status: state.status, registered: state.status === 'approved', requestId: 'synthetic-request' } };
    },
    from(table) {
      assert.equal(table, 'vault_notes'); state.accesses++;
      const q = { select() { return q; }, eq() { return q; }, update() { return q; }, delete() { return q; }, insert: async () => ({ error: null }),
        order: async () => ({ data: [note] }), maybeSingle: async () => ({ data: note }) };
      return q;
    },
  };
  return { state, client };
}
async function call(handler, { method = 'GET', body, query = {}, headers = {} } = {}) {
  const out = { headers: {} };
  await handler({ method, body, query, headers: { host: 'test.example', origin: 'https://test.example', ...headers } }, {
    setHeader(k, v) { out.headers[k] = v; }, status(s) { out.status = s; return this; }, json(v) { out.body = v; return this; },
  });
  return out;
}
test('request stays pending; UI claims cannot approve or replace session', async () => {
  const { state, client } = fixture();
  const handler = createDeviceHandler({ client, verify: async () => user });
  assert.equal((await call(handler)).body.registered, false);
  assert.equal((await call(handler, { method: 'POST', body: {} })).body.status, 'pending');
  assert.equal((await call(handler, { method: 'POST', body: { approved: true, sessionId: 'attacker' } })).status, 400);
  assert.equal(state.status, 'pending');
  assert.equal((await call(handler, { method: 'POST', body: {}, headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call(createDeviceHandler({ client, verify: async () => null }))).status, 401);
});
test('notes reject all methods before approval, open after server approval, reject again after revocation', async () => {
  const { state, client } = fixture();
  const handler = createNotesHandler({ client, verify: async () => user });
  for (const status of ['not_requested', 'pending', 'rejected', 'revoked', 'expired', 'session_invalid']) {
    state.status = status;
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      assert.equal((await call(handler, { method, headers: { 'x-device-approved': 'true' } })).status, 403);
    }
  }
  assert.equal(state.accesses, 0);
  state.status = 'approved';
  const result = await call(handler);
  assert.equal(result.status, 200); assert.equal(result.body.notes[0].title, 'synthetic');
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await call(handler, { method: 'GET', query: { id: note.public_id } })).status, 200);
  assert.equal((await call(handler, { method: 'POST', body: { title: 'synthetic', body: 'fixture' } })).status, 201);
  assert.equal((await call(handler, { method: 'PUT', query: { id: note.public_id }, body: { title: 'synthetic', body: 'fixture' } })).status, 200);
  assert.equal((await call(handler, { method: 'DELETE', query: { id: note.public_id } })).status, 200);
  const beforeDenied = state.accesses;
  state.status = 'revoked'; assert.equal((await call(handler)).status, 403);
  state.fail = true; assert.equal((await call(handler)).status, 503);
  assert.equal(state.accesses, beforeDenied);
});
test('missing verified session and judge without device contract cannot bypass approval', async () => {
  const { state, client } = fixture();
  for (const verified of [{ ...user, sessionId: null }, { kind: 'judge', userId: user.userId }]) {
    assert.equal((await call(createNotesHandler({ client, verify: async () => verified }))).status, 403);
  }
  assert.equal(state.accesses, 0); assert.equal(state.rpcCalls.length, 0);
});
test('restore also requires approval; approved B gets existing restore result', async () => {
  const { state, client } = fixture();
  const backup = { id: note.public_id, ownerId: note.owner_id, title: note.title, body: note.content };
  const handler = createRestoreHandler({ client, verify: async () => user, backup, expectedHash: contentHash(backup.title, backup.body) });
  assert.equal((await call(handler, { method: 'POST', body: { id: note.public_id } })).status, 403);
  assert.equal(state.accesses, 0);
  state.status = 'approved';
  assert.equal((await call(handler, { method: 'POST', body: { id: note.public_id } })).body.restored, true);
});
