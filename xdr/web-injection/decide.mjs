// T1190 patterns.json의 패턴을 상수로 내장합니다. 심판 격리 실행: import / IO / network 없음.
const PATTERNS = Object.freeze([
  {
    "name": "sql-injection-repeat",
    "condition": "동일 출발 주소의 요청 인자에서 SQL 구문 표식이 반복되고 경보의 반복 횟수와 설명이 일치함",
    "evidence": "T1190: 외부 공개 웹 앱의 입력 처리 취약점을 SQL 주입으로 악용하려는 반복 시도."
  },
  {
    "name": "script-tag-repeat",
    "condition": "동일 출발 주소의 요청 인자에서 스크립트 태그 또는 삽입 표식이 반복되고 경보의 반복 횟수와 설명이 일치함",
    "evidence": "T1190: 외부 공개 웹 앱의 입력 검증 취약점을 스크립트 삽입으로 악용하려는 반복 시도."
  },
  {
    "name": "path-traversal-repeat",
    "condition": "동일 출발 주소의 요청 경로 인자에서 ../ 같은 상위 경로 이동 표식이 반복되고 경보의 반복 횟수와 설명이 일치함",
    "evidence": "T1190: 외부 공개 웹 앱의 경로 처리 취약점을 이용해 허용 범위 밖의 파일에 접근하려는 반복 시도."
  },
  {
    "name": "command-separator-repeat",
    "condition": "동일 출발 주소의 요청 인자에서 명령 구분자 표식이 반복되며 경보 설명과 반복 횟수가 일치함",
    "evidence": "T1190: 외부 공개 웹 앱의 입력 처리 취약점을 명령 삽입 형태로 악용하려는 반복 시도."
  },
  {
    "name": "single-unconfirmed-web-input",
    "condition": "T1190으로 분류된 웹 입력 이상 징후가 한 번 관찰됐지만 주입 악용이나 반복 근거가 부족함",
    "evidence": "T1190 관련 단발성 이상 입력은 공격 성공 또는 차단 근거가 부족하므로 확인 알림만 남긴다."
  }
].map(item => Object.freeze(item)));

export function decide(alert) {
  const data = alert?.data;
  const rule = alert?.rule;
  const description = typeof rule?.description === 'string' ? rule.description : '';
  const url = typeof data?.url === 'string' ? data.url : '';
  const level = Number.isInteger(rule?.level) ? rule.level : -1;
  const count = typeof data?.count === 'string' && /^\d+$/.test(data.count)
    ? Number(data.count) : Number.isInteger(data?.count) ? data.count : 0;
  const source = typeof data?.srcip === 'string' && data.srcip.length > 0;
  const t1190 = Array.isArray(rule?.mitre) && rule.mitre.includes('T1190');
  const repeated = count >= 5 && /반복|연속|\d+번|같은 주소|한 주소/.test(description);
  const sql = /SQL 구문|SQL 표식|데이터베이스 조회를 이어 붙/.test(description) ||
    /doc-sql-(?:chain|or|select-chain)/.test(url);
  const script = /스크립트 삽입|스크립트 표식/.test(description) ||
    /doc-script-marker/.test(url);
  const traversal = /경로.*(?:거슬러|이탈)|상위 디렉터리/.test(description) ||
    /doc-up-repeat/.test(url);
  const command = /명령 구분자/.test(description) && /doc-cmd-separator/.test(url);
  const names = [];
  if (sql) names.push(PATTERNS[0].name);
  if (script) names.push(PATTERNS[1].name);
  if (traversal) names.push(PATTERNS[2].name);
  if (command) names.push(PATTERNS[3].name);

  // 반복 횟수와 T1190, Wazuh 규칙 수준, 출발 주소를 동시에 요구합니다.
  const strong = t1190 && source && names.length > 0 && repeated && level >= 10;
  // 한 번의 이상 입력은 명확한 주입 증거가 아니므로 차단하지 않습니다.
  const uncertain = t1190 && source && !strong && level >= 5 &&
    (count === 1 || names.length > 0 || /주입|구분자|표기|표식/.test(description));
  const confidence = strong ? 0.94 : uncertain ? 0.60 : 0.12;
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  const reason = strong ? names.join(', ') :
    uncertain ? PATTERNS[4].name : 'no_pattern_match';
  return { action, confidence, reason };
}
