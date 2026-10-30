// Wazuh 웹 주입 연습 경보를 읽는 독립 확인 도구입니다.
// decide.mjs에서 import하지 않으며 원본 경보를 수정하지 않습니다.
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL('../fixtures/web-injection.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixtureUrl, 'utf8'));

if (!Array.isArray(fixture.alerts)) throw new TypeError('alerts must be an array');

// 지정된 다섯 필드만 출력합니다. URL, 요청 본문, 쿠키, 토큰은 출력하지 않습니다.
const secretPattern = /password|passwd|pwd|secret|token|api[_-]?key|authorization|bearer|credential|private[_-]?key|cookie|session|비밀|암호|비밀번호|토큰|인증키/i;

function safeText(value, pattern, maxLength = 240) {
  if (typeof value !== 'string' || value.length > maxLength ||
      !pattern.test(value) || secretPattern.test(value)) return '[가림]';
  return value;
}

function readAlert(alert) {
  const a = alert && typeof alert === 'object' ? alert : {};
  const data = a.data && typeof a.data === 'object' ? a.data : {};
  const rule = a.rule && typeof a.rule === 'object' ? a.rule : {};
  return {
    timestamp: safeText(a.timestamp, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/),
    sourceAddress: safeText(data.srcip, /^(?:\d{1,3}\.){3}\d{1,3}$/),
    account: safeText(data.srcuser, /^[a-zA-Z0-9_.-]{1,64}$/),
    ruleLevel: Number.isInteger(rule.level) && rule.level >= 0 && rule.level <= 15 ? rule.level : '[가림]',
    description: safeText(rule.description, /^[가-힣a-zA-Z0-9\s.,!?():·~-]+$/u),
  };
}

const lines = fixture.alerts.map(readAlert);
for (const line of lines) console.log(JSON.stringify(line));
if (lines.length !== fixture.alerts.length) throw new Error('alert count mismatch');
console.error(`경보 ${fixture.alerts.length}건 / 추출 ${lines.length}줄 — 일치`);
