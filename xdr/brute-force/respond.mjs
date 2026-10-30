// XDR brute-force 대응 연결 준비: 검증되지 않은 경보로 운영 ZTNA 사용자를 차단하지 않습니다.
// 판정용 decide.mjs와 ZTNA src/decider.mjs의 기존 코드는 변경하지 않습니다.
import { appendFile, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const ruleFile = new URL('./candidate-rules.json', import.meta.url);
const logFile = new URL('../alerts.log', import.meta.url);
const fixtureFile = new URL('../fixtures/brute-force.json', import.meta.url);
const actions = new Set(['block', 'alert', 'record']);
const sourcePattern = /^(?:\d{1,3}\.){3}\d{1,3}$/;
const idPattern = /^bf-[a-zA-Z0-9_-]{1,32}$/;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

function validIpv4(value) {
  if (typeof value !== 'string' || !sourcePattern.test(value)) return false;
  return value.split('.').every((part) => Number(part) <= 255);
}

function validDecision(decision) {
  return decision && typeof decision === 'object' &&
    actions.has(decision.action) &&
    Number.isFinite(decision.confidence) &&
    decision.confidence >= 0 && decision.confidence <= 1;
}

async function readCandidates() {
  try {
    const parsed = JSON.parse(await readFile(ruleFile, 'utf8'));
    if (!Array.isArray(parsed.rules)) throw new Error('candidate-rules format invalid');
    return parsed.rules;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error; // 형식 오류나 읽기 오류가 발생하면 이전 규칙을 덮어쓰지 않음
  }
}

// 경보마다 한 번 호출. 파일에는 비밀번호, 토큰, 경보 원문과 설명을 남기지 않습니다.
export async function respond(alert, decision, options = {}) {
  if (!validDecision(decision)) throw new TypeError('invalid XDR decision');
  const alertId = alert?.id;
  if (!idPattern.test(alertId ?? '')) throw new TypeError('invalid alert ID');

  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(nowMs) || !Number.isInteger(ttlMs) ||
      ttlMs < 1000 || ttlMs > 60 * 60 * 1000) {
    throw new RangeError('invalid time or TTL');
  }

  // XDR의 출발 IP는 ZTNA 계약의 검증된 subjectId가 아닙니다.
  // 일치 근거가 없으므로 운영 적용 규칙은 만들지 않고, 만료되는 후보만 적재합니다.
  const sourceAddress = alert?.data?.srcip;
  const isBlockCandidate = decision.action === 'block' &&
    decision.confidence >= 0.85 &&
    Number.isInteger(alert?.rule?.level) && alert.rule.level >= 10 &&
    Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1110') &&
    validIpv4(sourceAddress);
  const timestamp = new Date(nowMs).toISOString();

  await mkdir(dirname(fileURLToPath(ruleFile)), { recursive: true });
  const candidates = (await readCandidates()).filter((rule) =>
    rule && rule.status === 'pending_verified_binding' &&
    Date.parse(rule.expiresAt) > nowMs &&
    rule.alertId !== alertId
  );

  if (isBlockCandidate) {
    candidates.push({
      ruleId: `xdr.brute-force.${alertId}`,
      alertId,
      sourceAddress,
      expiresAt: new Date(nowMs + ttlMs).toISOString(),
      status: 'pending_verified_binding',
      // ZTNA 요청에는 source IP가 없으므로 실제 deny 적용 불가
    });
  }

  await writeFile(ruleFile, JSON.stringify({
    schema: 'aleph.xdr.candidate-rules.v1',
    rules: candidates,
  }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });

  // 보안상 알림에는 승인된 경보 ID·분류·시각만 기록
  const status = isBlockCandidate ? 'candidate_pending' : 'not_blocked';
  await appendFile(logFile, JSON.stringify({
    at: timestamp, alertId, action: decision.action,
    confidence: decision.confidence, status,
  }) + '\n', { encoding: 'utf8', mode: 0o600 });

  return { alertId, status, expiresAt: isBlockCandidate
    ? new Date(nowMs + ttlMs).toISOString() : null,
    appliedToZtna: false };
}

// 로컬에서만 실행. decide.mjs가 준비되지 않은 경우 실행을 멈추며 성공으로 보고하지 않습니다.
export async function replay() {
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' ||
      fixture.moduleKey !== 'brute-force' || !Array.isArray(fixture.alerts)) {
    throw new TypeError('invalid brute-force fixture');
  }
  const { decide } = await import(new URL('./decide.mjs', import.meta.url).href);
  if (typeof decide !== 'function') throw new TypeError('missing decide(alert)');
  const counts = { block: 0, alert: 0, record: 0, candidate: 0 };
  for (const alert of fixture.alerts) {
    const decision = await decide(alert);
    if (!validDecision(decision)) throw new TypeError('invalid XDR decision');
    const result = await respond(alert, decision);
    counts[decision.action]++;
    if (result.status === 'candidate_pending') counts.candidate++;
  }
  return { alerts: fixture.alerts.length, counts, ztnaIntegrated: false };
}

const main = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (main) {
  replay().then((result) => {
    console.log(JSON.stringify(result));
  }).catch((error) => {
    console.error(error?.code === 'ERR_MODULE_NOT_FOUND'
      ? 'decide.mjs가 없어 재생을 실행하지 않았습니다.'
      : '재생 실패: ' + (error?.message ?? 'unknown'));
    process.exitCode = 1;
  });
}
