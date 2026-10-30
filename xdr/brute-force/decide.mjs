// patterns.json의 T1110 패턴 두 개를 독립 실행용 상수로 옮긴 것입니다.
// XDR 판정 전용: import, 파일 입출력, 네트워크 호출 없음.
const PATTERNS = Object.freeze([
  Object.freeze({
    name: 'rapid_failed_logins_same_source',
    conditions: Object.freeze({
      eventType: 'authentication_failure',
      groupBy: ['data.srcip'],
      signals: [
        '같은 출발 주소에서 짧은 시간 동안 로그인 실패가 반복됨',
        '반복 실패 건수와 관측 시간 구간이 경보에 명시됨',
      ],
      requireCorrelatedEvents: true,
    }),
    evidence: 'MITRE ATT&CK T1110 탐지 전략 DET0463은 동일 IP·짧은 시간대의 다수 인증 실패를 무차별 대입 탐지 신호로 설명한다.',
  }),
  Object.freeze({
    name: 'password_spraying_multiple_accounts',
    conditions: Object.freeze({
      eventType: 'authentication_failure',
      groupBy: ['data.srcip'],
      signals: [
        '같은 출발 주소가 짧은 시간에 여러 계정의 인증을 시도함',
        '여러 계정에 같은 비밀번호를 사용했다는 신뢰할 수 있는 탐지 근거가 있음',
      ],
      requireCorrelatedEvents: true,
      secretHandling: '비밀번호 원문·해시·토큰은 저장하거나 출력하지 않음',
    }),
    evidence: 'MITRE ATT&CK T1110.003 Password Spraying은 하나 또는 소수의 비밀번호를 여러 계정에 시험하는 무차별 대입 하위 기법이다.',
  }),
]);

export function decide(alert) {
  const rule = alert?.rule;
  const description = typeof rule?.description === 'string' ? rule.description : '';
  const level = Number.isInteger(rule?.level) ? rule.level : -1;
  const hasT1110 = Array.isArray(rule?.mitre) && rule.mitre.includes('T1110');
  const hasSource = typeof alert?.data?.srcip === 'string' && alert.data.srcip.length > 0;

  // 경보 설명은 이미 집계된 Wazuh 탐지 결과입니다.
  // 현재 경보에서 확인할 수 없는 개별 로그인 이벤트·비밀번호는 추측하지 않습니다.
  const multipleAccounts = /여러 계정|서로 다른 계정|계정 \d+개|계정 이름을 바꿔/.test(description);
  const samePassword = /같은 비밀번호/.test(description);
  const spray = multipleAccounts && samePassword;
  const repeatedFailure = /실패/.test(description) &&
    (/\d+건|연속|이어졌|쌓였|같은 간격/.test(description));
  const explicitNormal = /로그인이 성공했습니다|로그아웃|비밀번호 변경이 성공했습니다|세션 유지|로그인 상태가 유지|자료실 화면이 열렸|실패.*(?:뒤에|그 뒤) 성공했습니다/.test(description);

  // 두 패턴 중 확인된 근거가 있는 것만 사용합니다.
  // 기존 판정기의 Wazuh 수준 10 / 5 기준과 확신도(0.94/0.67/0.12)는 유지합니다.
  const matched = hasT1110 && hasSource && (spray || repeatedFailure || multipleAccounts);
  const patternName = spray
    ? PATTERNS[1].name : PATTERNS[0].name;

  let confidence = 0.12;
  let reason = 'no_pattern_match';
  if (matched && !explicitNormal && level >= 10) {
    confidence = 0.94;
    reason = patternName;
  } else if (hasT1110 && hasSource && level >= 5 &&
             (matched || /실패/.test(description))) {
    // 신호가 약하거나 성공과 함께 나온 경보는 차단하지 않고 알림만 남깁니다.
    confidence = 0.67;
    reason = patternName;
  }

  const action = confidence >= 0.85 ? 'block' :
    confidence >= 0.5 ? 'alert' : 'record';
  return { action, confidence, reason };
}
