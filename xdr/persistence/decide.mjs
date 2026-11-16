const PATTERNS = Object.freeze([
  { name: 'unsigned-new-service', condition: '평소 목록에 없는 새 서비스가 등록됐고 실행 파일에 서명이 없음', evidence: 'T1543: 지속 실행을 위해 시스템 서비스를 새로 만들거나 기존 서비스를 변경할 수 있음.' },
  { name: 'unfamiliar-scheduled-task', condition: '평소 목록에 없는 예약 작업이 생성되거나 실행 대상으로 등록됨', evidence: 'T1053: 예약 작업 기능을 이용해 프로그램을 주기적으로 또는 시작 시 실행할 수 있음.' },
  { name: 'unexpected-startup-folder-change', condition: '시작 폴더에 평소 목록에 없는 프로그램이 추가되거나 기존 항목이 변경됨', evidence: 'T1547.001: 시작 폴더에 프로그램을 추가하면 사용자 로그인 시 실행될 수 있음.' },
]);

export function decide(alert) {
  const rule = alert?.rule ?? {};
  const description = typeof rule.description === 'string' ? rule.description : '';
  const path = typeof alert?.data?.path === 'string' ? alert.data.path : '';
  const level = Number.isInteger(rule.level) ? rule.level : -1;
  const techniques = Array.isArray(rule.mitre) ? rule.mitre : [];
  const relevant = techniques.some(value => ['T1543', 'T1053', 'T1547.001'].includes(value));
  const temporary = /(?:^|[\\/])temp(?:[\\/]|$)/i.test(path);
  const startup = /시작 폴더|시작 프로그램|시작 항목/.test(description);
  const task = /예약 작업/.test(description);
  const service = /서비스/.test(description);
  const unsigned = /서명 없는|서명이 없습니다/.test(description);
  const unfamiliar = /평소 목록에 없는|처음 보는/.test(description);
  const repeated = /연속/.test(description) && Number(alert?.data?.count) >= 3;
  const clear = relevant && level >= 10 && (
    (service && ((unsigned && (temporary || repeated)) || (unfamiliar && temporary))) ||
    (task && temporary && (unfamiliar || /임의 문자열|시작 프로그램/.test(description))) ||
    (startup && unfamiliar && /추가/.test(description))
  );
  let confidence = 0.12;
  let reason = 'no_pattern_match';
  if (clear || (relevant && level >= 5 && (service || task || startup || temporary))) {
    confidence = clear ? 0.94 : 0.60;
    reason = startup && !task ? PATTERNS[2].name : task ? PATTERNS[1].name : PATTERNS[0].name;
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
