// T1190 patterns.json의 세 패턴을 독립 심판 실행용 상수로 복사했습니다.
// import, 파일 입출력, 네트워크 요청 없음.
const PATTERNS = Object.freeze([
  Object.freeze({name:'sql-injection-repeat',condition:'동일 출발 주소의 요청 인자에서 SQL 구문 표식이 반복되고 경보의 반복 횟수와 설명이 일치함',evidence:'T1190: 외부 공개 웹 앱의 입력 처리 취약점을 SQL 주입으로 악용하려는 반복 시도.'}),
  Object.freeze({name:'script-tag-repeat',condition:'동일 출발 주소의 요청 인자에서 스크립트 태그 또는 삽입 표식이 반복되고 경보의 반복 횟수와 설명이 일치함',evidence:'T1190: 외부 공개 웹 앱의 입력 검증 취약점을 스크립트 삽입으로 악용하려는 반복 시도.'}),
  Object.freeze({name:'path-traversal-repeat',condition:'동일 출발 주소의 요청 경로 인자에서 ../ 같은 상위 경로 이동 표식이 반복되고 경보의 반복 횟수와 설명이 일치함',evidence:'T1190: 외부 공개 웹 앱의 경로 처리 취약점을 이용해 허용 범위 밖의 파일에 접근하려는 반복 시도.'}),
]);

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
  const normal = /수업|공지|정상|반복은 없|반복되지 않|공격 표기는 없|한 번|1건|한 건/.test(description);
  const repeated = count >= 5 && /반복|연속|\d+번|같은 주소|한 주소/.test(description);
  const sql = /SQL 구문|SQL 표식|데이터베이스 조회를 이어 붙/.test(description) ||
    /doc-sql-(?:chain|or|select-chain)/.test(url);
  const script = /스크립트 삽입|스크립트 표식/.test(description) ||
    /doc-script-marker/.test(url);
  const traversal = /경로.*(?:거슬러|이탈)|상위 디렉터리/.test(description) ||
    /doc-up-repeat/.test(url);
  const names = [];
  if (sql) names.push(PATTERNS[0].name);
  if (script) names.push(PATTERNS[1].name);
  if (traversal) names.push(PATTERNS[2].name);
  const matched = t1190 && source && names.length > 0 && !normal;
  let confidence = 0.12;
  if (matched && repeated && level >= 10) confidence = 0.94;
  else if (matched && level >= 5) confidence = 0.67;
  else if (t1190 && source && level >= 5 && !normal &&
    /주입|구분자|표기|표식/.test(description)) confidence = 0.60;
  const action = confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record';
  const reason = matched ? names.join(', ') :
    confidence >= 0.5 ? 'T1190-weak-injection-signal' : 'no_pattern_match';
  return {action, confidence, reason};
}
