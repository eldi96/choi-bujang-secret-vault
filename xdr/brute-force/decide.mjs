// 독립 실행형 XDR brute-force 판정기. 원본 patterns.json이 없어
// 현재 제공된 Wazuh 연습 경보의 규칙 수준과 T1110 표시를 기준으로 정의한 패턴입니다.
// 네트워크·파일 입출력·외부 import 없음.
const PATTERNS = Object.freeze({
  clearBruteForce: Object.freeze({
    name: 'brute_force_high_volume',
    minLevel: 10,
    mitre: 'T1110',
    confidence: 0.94,
  }),
  suspiciousAttempts: Object.freeze({
    name: 'brute_force_suspicious_attempts',
    minLevel: 5,
    mitre: 'T1110',
    confidence: 0.67,
  }),
  ordinaryActivity: Object.freeze({
    name: 'ordinary_auth_activity',
    confidence: 0.12,
  }),
});

export function decide(alert) {
  const rule = alert && typeof alert === 'object' ? alert.rule : null;
  const level = rule && Number.isInteger(rule.level) ? rule.level : -1;
  const tags = Array.isArray(rule?.mitre) ? rule.mitre : [];
  const description = typeof rule?.description === 'string' ? rule.description : '';

  // 성공·로그아웃·세션 유지 같은 정상 동작을 차단하지 않습니다.
  // 공격 여부가 불분명하면 차단 대신 관찰합니다.
  const benign = /로그인.*성공|로그아웃|비밀번호 변경이 성공|세션 유지|로그인 상태가 유지|자료실 화면이 열렸|실패.*뒤에 성공|실패.*그 뒤 성공/.test(description);
  const mentionsFailures = /실패|비밀번호를.*넣|로그인 시도/.test(description);
  const hasMitre = tags.includes(PATTERNS.clearBruteForce.mitre);

  let confidence = PATTERNS.ordinaryActivity.confidence;
  let reason = PATTERNS.ordinaryActivity.name;

  if (!benign && hasMitre && mentionsFailures &&
      level >= PATTERNS.clearBruteForce.minLevel) {
    confidence = PATTERNS.clearBruteForce.confidence;
    reason = PATTERNS.clearBruteForce.name;
  } else if (hasMitre && level >= PATTERNS.suspiciousAttempts.minLevel) {
    confidence = PATTERNS.suspiciousAttempts.confidence;
    reason = PATTERNS.suspiciousAttempts.name;
  }

  const action = confidence >= 0.85 ? 'block' :
    confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}
