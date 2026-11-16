// 후보 기록과 로컬 연결 확인. 운영 ZTNA 정책에는 적용하지 않습니다.
import { appendFile, readFile, writeFile } from 'node:fs/promises';

const ruleFile = new URL('./candidate-rules.json', import.meta.url);
const logFile = new URL('../alerts.log', import.meta.url);
const reasons = new Set(['jndi-lookup-in-header', 'jndi-lookup-in-parameter']);

export async function respond(alert, decision, options = {}) {
  const id = alert?.id;
  if (typeof id !== 'string' || !/^kc-\d{2,6}$/.test(id)) throw new TypeError('invalid alert ID');
  if (!decision || !['block', 'alert', 'record'].includes(decision.action) ||
      !Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1 ||
      typeof decision.reason !== 'string') throw new TypeError('invalid decision');
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? 300000;
  if (!Number.isFinite(now) || !Number.isSafeInteger(ttl) || ttl < 1000 || ttl > 3600000 ||
      !Number.isFinite(new Date(now + ttl).getTime())) throw new RangeError('invalid time');
  let rules;
  try {
    const saved = JSON.parse(await readFile(ruleFile, 'utf8'));
    if (saved?.schema !== 'aleph.xdr.candidate-rules.v1' || !Array.isArray(saved.rules)) throw new TypeError('invalid candidates');
    rules = saved.rules;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    rules = [];
  }
  const eligible = decision.action === 'block' && decision.confidence >= 0.85 && reasons.has(decision.reason);
  const expiresAt = eligible ? new Date(now + ttl).toISOString() : null;
  rules = rules.filter(rule => rule?.alertId !== id && Number.isFinite(Date.parse(rule?.expiresAt)) && Date.parse(rule.expiresAt) > now);
  if (eligible) rules.push({ ruleId: `xdr.known-cve.${id}`, alertId: id, pattern: decision.reason, expiresAt, status: 'pending_verified_binding' });
  await writeFile(ruleFile, JSON.stringify({ schema: 'aleph.xdr.candidate-rules.v1', rules }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await appendFile(logFile, JSON.stringify({ at: new Date(now).toISOString(), moduleKey: 'known-cve', alertId: id, action: decision.action, confidence: decision.confidence, status: eligible ? 'candidate_pending' : 'not_blocked' }) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { alertId: id, status: eligible ? 'candidate_pending' : 'not_blocked', expiresAt, appliedToZtna: false };
}

// 호출자가 경보와 정확히 같은 요청임을 독립적으로 검증한 경우에만 로컬 판정을 추가합니다.
export function evaluateLocal({ request, baseDecision, candidate, correlation, now = Date.now() }) {
  if (!request || typeof request.requestId !== 'string' || !baseDecision ||
      baseDecision.schema !== 'aleph.decision.v1' || baseDecision.requestId !== request.requestId ||
      !['allow', 'deny', 'step_up'].includes(baseDecision.decision) || !Number.isFinite(now)) throw new TypeError('invalid input');
  if (baseDecision.decision !== 'allow') return { ...baseDecision };
  const id = candidate?.alertId;
  const valid = typeof id === 'string' && /^kc-\d{2,6}$/.test(id) &&
    candidate.ruleId === `xdr.known-cve.${id}` && candidate.status === 'pending_verified_binding' &&
    reasons.has(candidate.pattern) && Number.isFinite(Date.parse(candidate.expiresAt)) && Date.parse(candidate.expiresAt) > now &&
    correlation?.verified === true && correlation.alertId === id && correlation.requestId === request.requestId;
  if (!valid) return { ...baseDecision };
  return { schema: 'aleph.decision.v1', requestId: request.requestId, decision: 'deny', reasonCode: 'xdr_local_candidate', ruleIds: [candidate.ruleId] };
}
