// XDR web-injection 대응: 확인된 차단 후보만 기록하며 ZTNA 운영 규칙은 변경하지 않습니다.
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const ruleFile = new URL('./candidate-rules.json', import.meta.url);
const logFile = new URL('../alerts.log', import.meta.url);
const fixtureFile = new URL('../fixtures/web-injection.json', import.meta.url);
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const allowedActions = new Set(['block', 'alert', 'record']);
const allowedReasons = new Set([
  'sql-injection-repeat', 'script-tag-repeat', 'path-traversal-repeat',
  'command-separator-repeat',
]);

function validIp(ip) {
  return typeof ip === 'string' && /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
    ip.split('.').every(part => Number(part) <= 255);
}
function validDecision(d) {
  return d && allowedActions.has(d.action) &&
    typeof d.confidence === 'number' && Number.isFinite(d.confidence) &&
    d.confidence >= 0 && d.confidence <= 1 &&
    typeof d.reason === 'string';
}
async function existingRules() {
  try {
    const parsed = JSON.parse(await readFile(ruleFile, 'utf8'));
    if (parsed?.schema !== 'aleph.xdr.candidate-rules.v1' || !Array.isArray(parsed.rules)) {
      throw new Error('invalid candidate rules format');
    }
    return parsed.rules;
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

// 경보 1건의 판정 결과를 처리합니다. IP만으로 ZTNA 신원·기기를 추정하지 않습니다.
export async function respond(alert, decision, options = {}) {
  if (!validDecision(decision)) throw new TypeError('invalid XDR decision');
  const alertId = alert?.id;
  if (typeof alertId !== 'string' || !/^wi-[0-9]{2,6}$/.test(alertId)) {
    throw new TypeError('invalid alert ID');
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  if (!Number.isFinite(nowMs) || !Number.isInteger(ttlMs) ||
      ttlMs < 1000 || ttlMs > 3600000) throw new RangeError('invalid time or TTL');

  const sourceAddress = alert?.data?.srcip;
  const count = Number(alert?.data?.count);
  const reasonNames = decision.reason.split(',').map(x => x.trim());
  const hasSupportedPattern = reasonNames.length > 0 &&
    reasonNames.every(name => allowedReasons.has(name));
  const eligible = decision.action === 'block' && decision.confidence >= 0.85 &&
    Number.isInteger(alert?.rule?.level) && alert.rule.level >= 10 &&
    Array.isArray(alert?.rule?.mitre) && alert.rule.mitre.includes('T1190') &&
    validIp(sourceAddress) && Number.isSafeInteger(count) && count >= 5 &&
    hasSupportedPattern;

  const previous = await existingRules();
  const rules = previous.filter(rule =>
    rule?.status === 'pending_verified_binding' &&
    Number.isFinite(Date.parse(rule.expiresAt)) &&
    Date.parse(rule.expiresAt) > nowMs &&
    rule.alertId !== alertId
  );
  const expiresAt = eligible ? new Date(nowMs + ttlMs).toISOString() : null;
  if (eligible) {
    rules.push({
      ruleId: `xdr.web-injection.${alertId}`,
      alertId,
      sourceAddress,
      patternNames: reasonNames,
      expiresAt,
      status: 'pending_verified_binding',
    });
  }
  // 후보 파일은 ZTNA 거부 규칙이 아닙니다. 연결 계약이 없으므로 적용하지 않습니다.
  await writeFile(ruleFile, JSON.stringify({
    schema: 'aleph.xdr.candidate-rules.v1', rules,
  }, null, 2) + '\n', {encoding:'utf8',mode:0o600});
  const status = eligible ? 'candidate_pending' : 'not_blocked';
  // 원본 URL·설명·비밀값은 기록하지 않습니다.
  await appendFile(logFile, JSON.stringify({
    at: new Date(nowMs).toISOString(), moduleKey:'web-injection',
    alertId, action:decision.action, confidence:decision.confidence, status,
  }) + '\n', {encoding:'utf8',mode:0o600});
  return {alertId,status,expiresAt,appliedToZtna:false};
}

export async function replay() {
  const fixture = JSON.parse(await readFile(fixtureFile, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' ||
      fixture.moduleKey !== 'web-injection' || !Array.isArray(fixture.alerts)) {
    throw new TypeError('invalid web-injection fixture');
  }
  const {decide} = await import(new URL('./decide.mjs', import.meta.url).href);
  if (typeof decide !== 'function') throw new TypeError('missing decide(alert)');
  const counts = {block:0,alert:0,record:0,candidate:0};
  for (const alert of fixture.alerts) {
    const decision = await decide(alert);
    if (!validDecision(decision)) throw new TypeError('invalid XDR decision');
    const result = await respond(alert,decision);
    counts[decision.action]++;
    if (result.status === 'candidate_pending') counts.candidate++;
  }
  return {alerts:fixture.alerts.length,counts,ztnaIntegrated:false};
}

const main = process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (main) {
  replay().then(result => console.log(JSON.stringify(result))).catch(() => {
    console.error('웹 주입 경보 재생 실패: 입력 형식 또는 파일 상태를 확인하세요.');
    process.exitCode = 1;
  });
}
