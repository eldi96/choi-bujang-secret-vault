// 로컬 차단 후보와 가상 기기 연결 확인. 운영 정책은 변경하지 않습니다.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { decide } from './decide.mjs';

const ruleFile = new URL('./candidate-rules.json', import.meta.url);
const logFile = new URL('../alerts.log', import.meta.url);
const reasons = new Set(['unsigned-new-service', 'unfamiliar-scheduled-task', 'unexpected-startup-folder-change']);

export async function respond(alert, decision, options = {}) {
  const id = alert?.id;
  if (typeof id !== 'string' || !/^ps-\d{2,6}$/.test(id)) throw new TypeError('invalid alert ID');
  if (!decision || !['block', 'alert', 'record'].includes(decision.action) ||
      !Number.isFinite(decision.confidence) || decision.confidence < 0 || decision.confidence > 1 ||
      typeof decision.reason !== 'string') throw new TypeError('invalid decision');
  const now = options.now ?? Date.now();
  const ttl = options.ttlMs ?? 300000;
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()) || !Number.isSafeInteger(ttl) ||
      ttl < 1000 || ttl > 3600000 || !Number.isFinite(new Date(now + ttl).getTime())) throw new RangeError('invalid time');
  let rules;
  try {
    const saved = JSON.parse(await readFile(ruleFile, 'utf8'));
    if (saved?.schema !== 'aleph.xdr.candidate-rules.v1' || !Array.isArray(saved.rules)) throw new TypeError('invalid candidates');
    rules = saved.rules;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    rules = [];
  }
  const checked = decide(alert);
  const eligible = decision.action === 'block' && decision.confidence >= 0.85 && reasons.has(decision.reason) &&
    checked.action === decision.action && checked.confidence === decision.confidence && checked.reason === decision.reason;
  const expiresAt = eligible ? new Date(now + ttl).toISOString() : null;
  rules = rules.filter(rule => rule?.alertId !== id && Number.isFinite(Date.parse(rule?.expiresAt)) && Date.parse(rule.expiresAt) > now);
  if (eligible) rules.push({ ruleId: `xdr.persistence.${id}`, alertId: id, pattern: decision.reason, expiresAt, status: 'pending_verified_binding' });
  await writeFile(ruleFile, JSON.stringify({ schema: 'aleph.xdr.candidate-rules.v1', rules }, null, 2) + '\n', { encoding: 'utf8', mode: 0o600 });
  await appendFile(logFile, JSON.stringify({ at: new Date(now).toISOString(), moduleKey: 'persistence', alertId: id, action: decision.action, confidence: decision.confidence, status: eligible ? 'candidate_pending' : 'not_blocked' }) + '\n', { encoding: 'utf8', mode: 0o600 });
  return { alertId: id, status: eligible ? 'candidate_pending' : 'not_blocked', expiresAt, appliedToZtna: false };
}

// 신뢰 가능한 외부 절차가 경보와 기기 ID를 결합했다고 가정하는 로컬 시험입니다.
export function evaluateLocal({ request, baseDecision, candidate, binding, now = Date.now() }) {
  if (!request || request.schema !== 'aleph.decision.v1' || typeof request.requestId !== 'string' ||
      !baseDecision || baseDecision.schema !== 'aleph.decision.v1' || baseDecision.requestId !== request.requestId ||
      !['allow', 'deny', 'step_up'].includes(baseDecision.decision) || !Number.isFinite(now)) throw new TypeError('invalid input');
  if (baseDecision.decision !== 'allow') return { ...baseDecision };
  const id = candidate?.alertId;
  const valid = typeof id === 'string' && /^ps-\d{2,6}$/.test(id) &&
    candidate.ruleId === `xdr.persistence.${id}` && candidate.status === 'pending_verified_binding' &&
    reasons.has(candidate.pattern) && Number.isFinite(Date.parse(candidate.expiresAt)) && Date.parse(candidate.expiresAt) > now &&
    request.deviceRegistered === true && /^[a-f0-9]{16}$/.test(request.deviceId ?? '') &&
    binding?.verified === true && binding.alertId === id && binding.deviceId === request.deviceId;
  if (!valid) return { ...baseDecision };
  return { schema: 'aleph.decision.v1', requestId: request.requestId, decision: 'deny', reasonCode: 'xdr_local_candidate', ruleIds: [candidate.ruleId] };
}
