import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createOperationsHandler } from '../src/operations.mjs';

async function request(t, options = {}, method = 'GET') {
  const logs = []; let calls = 0;
  const handler = createOperationsHandler({
    verify: async () => ({ kind: 'student', userId: 'private-user', sessionId: 'private-session' }),
    client: { rpc: async (name, args) => {
      calls++; assert.equal(name, 'vault_device_access'); assert.equal(args.p_request, false);
      assert.equal(args.p_user, 'private-user'); assert.equal(args.p_session, 'private-session');
      return { data: { status: 'revoked', registered: false, requestId: 'private-request', body: 'private-note' } };
    } },
    config: { step: 11 }, version: 'a'.repeat(40), backupConfigured: true,
    log: line => logs.push(JSON.parse(line)), ...options,
  });
  const server = createServer((req, res) => {
    res.status = code => { res.statusCode = code; return res; };
    res.json = value => res.end(JSON.stringify(value));
    void handler(req, res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}`, { method });
  return { status: response.status, headers: response.headers, body: await response.json(), logs, calls };
}

test('HTTP 응답과 서버 기록 일치·개인정보 제외·모르는 수치는 null', async t => {
  const result = await request(t);
  assert.equal(result.status, 200); assert.equal(result.calls, 1);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  const { event, ...logged } = result.logs[0];
  assert.equal(event, 'operations_summary'); assert.deepEqual(logged, result.body);
  const { digest, ...record } = result.body;
  assert.equal(digest, createHash('sha256').update(JSON.stringify(record)).digest('hex'));
  assert.equal(result.body.summary.rules.count, 3);
  assert.equal(result.body.summary.revocation.approval.status, 'revoked');
  assert.equal(result.body.summary.detection.eventCount, null);
  assert.equal(result.body.summary.revocation.executedCount, null);
  assert.equal(result.body.summary.recovery.restoredVersion, null);
  assert.equal(result.body.summary.finalAssault.defended, null);
  const rows = result.body.summary.verification.rows;
  assert.equal(rows.length, 22);
  for (let step = 1; step <= 11; step++) {
    assert.deepEqual(rows.filter(row => row.step === step).map(row => row.kind), ['normal', 'forbidden']);
  }
  assert.ok(rows.every(row => row.execution === 'not_executed' && row.actualApiResult === null
    && row.requestId === null && row.checkedAt === null && !row.serverRecordMatched));
  assert.doesNotMatch(JSON.stringify(result), /private-user|private-session|private-request|private-note/);
});
test('무로그인·비학생·잘못된 메서드는 DB 조회와 기록을 남기지 않음', async t => {
  for (const user of [null, { kind: 'judge' }]) {
    const result = await request(t, { verify: async () => user });
    assert.equal(result.status, 401); assert.equal(result.calls, 0); assert.equal(result.logs.length, 0);
  }
  const result = await request(t, {}, 'POST');
  assert.equal(result.status, 405); assert.equal(result.calls, 0);
});
test('DB 장애는 승인 확인 불가·로그 실패는 결과 제공 중단', async t => {
  const result = await request(t, { client: { rpc: async () => { throw new Error('private-error'); } } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.summary.revocation.approval,
    { evidence: 'unavailable', status: 'registry_unavailable', registered: null });
  assert.doesNotMatch(JSON.stringify(result.body), /private-error/);
  assert.equal((await request(t, { log: () => { throw new Error(); } })).status, 503);
});
test('화면 수치와 대조 JSON은 HTTP 응답과 동일·오류 시 이전 결과 제거', async t => {
  const { body } = await request(t);
  const element = () => ({ textContent: '', children: [], disabled: false,
    append(...items) { this.children.push(...items); },
    replaceChildren(...items) { this.children = items; }, addEventListener() {} });
  const elements = Object.fromEntries(['#cards', '#status', '#evidence', '#refresh', '#verification-rows'].map(id => [id, element()]));
  let fail = false;
  const context = vm.createContext({ document: { querySelector: id => elements[id], createElement: element,
    addEventListener() {} }, addEventListener() {},
    fetch: async path => {
      assert.equal(path, '/api/operations');
      return { ok: !fail, status: fail ? 503 : 200, json: async () => body };
    } });
  vm.runInContext(await readFile(new URL('../public/operations.js', import.meta.url), 'utf8'), context);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(JSON.parse(elements['#evidence'].textContent), body);
  assert.equal(elements['#cards'].children[0].children[1].textContent, '3개 · 설정 확인');
  assert.equal(elements['#cards'].children[1].children[1].textContent, '미집계');
  assert.equal(elements['#cards'].children[2].children[1].textContent, '회수됨');
  const table = elements['#verification-rows'].children;
  assert.equal(table.length, 22);
  body.summary.verification.rows.forEach((row, index) => {
    assert.deepEqual(table[index].children.map(cell => cell.textContent),
      [`${row.step}단계 · ${row.kind === 'normal' ? '정상' : '금지'}`, row.request, row.expected,
        '미실행', '—', '—', '미실행']);
  });
  fail = true; await vm.runInContext('refresh()', context);
  assert.equal(elements['#cards'].children.length, 0);
  assert.equal(elements['#evidence'].textContent, '확인 전');
  assert.match(elements['#status'].textContent, /503/);
  assert.equal(elements['#verification-rows'].children.length, 1);
  assert.match(elements['#verification-rows'].children[0].children[0].textContent, /실측 결과 없음/);
});
