// 가상 경보를 확인하는 독립 도구입니다.
import { readFile } from 'node:fs/promises';

const fixture = JSON.parse(await readFile(new URL('../fixtures/exfiltration.json', import.meta.url), 'utf8'));
if (!Array.isArray(fixture.alerts)) throw new TypeError('alerts must be an array');

const secret = /password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer|credential|private[_-]?key|cookie|session|비밀|암호|비밀번호|토큰|인증키|[a-zA-Z0-9_]{24,}/i;
function safe(value, pattern) {
  return typeof value === 'string' && value.length <= 240 && pattern.test(value) && !secret.test(value)
    ? value : '[가림]';
}

for (const alert of fixture.alerts) {
  const data = alert?.data ?? {};
  const rule = alert?.rule ?? {};
  console.log(JSON.stringify({
    timestamp: safe(alert?.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/),
    sourceAddress: safe(data.srcip, /^(?:\d{1,3}\.){3}\d{1,3}$/),
    account: safe(data.srcuser, /^[a-zA-Z0-9_.-]{1,64}$/),
    ruleLevel: Number.isInteger(rule.level) && rule.level >= 0 && rule.level <= 15 ? rule.level : '[가림]',
    description: safe(rule.description, /^[가-힣a-zA-Z0-9\s.,!?():·~-]+$/u),
  }));
}
console.error(`경보 ${fixture.alerts.length}건 처리`);
