const PATTERNS = Object.freeze([
  { name: 'unexpected-admin-group-addition', condition: '평소 권한 목록에 없는 계정이 관리자 그룹에 추가됨', evidence: 'T1098.007: 계정을 관리자 그룹에 추가해 높은 권한을 유지할 수 있음.' },
  { name: 'unfamiliar-admin-command', condition: '계정이 평소 기록에 없는 관리자 명령을 실행함', evidence: 'T1078: 공격자는 기존 계정의 자격 증명을 악용해 권한 있는 자원에 접근할 수 있음.' },
  { name: 'after-hours-privileged-activity', condition: '계정이 평소 업무 시간 밖에 관리자 권한을 사용함', evidence: 'T1078: 기존 계정의 권한 사용은 도용 가능성을 조사할 수 있는 단서이며 시간만으로 도용을 확정할 수 없음.' },
  { name: 'privilege-escalation-exploitation', condition: '소프트웨어 취약점 악용으로 더 높은 권한을 얻으려는 근거가 확인됨', evidence: 'T1068: 소프트웨어 취약점을 악용해 권한을 높일 수 있음.' },
]);

export function decide(alert) {
  const rule = alert?.rule ?? {};
  const data = alert?.data ?? {};
  const description = typeof rule.description === 'string' ? rule.description : '';
  const level = Number.isInteger(rule.level) ? rule.level : -1;
  const relevant = Array.isArray(rule.mitre) && rule.mitre.some(x => ['T1068', 'T1078', 'T1098.007'].includes(x));
  const account = typeof data.srcuser === 'string' && data.srcuser.length > 0;
  const adminGroup = data.group === 'administrators' && /관리자 그룹/.test(description);
  const command = /관리자 명령|권한 명령|명령 실행/.test(description);
  const unusual = /원격 주소|방금 관리자가|처음 보는 주소|처음 봅니다|곧바로|업무처럼 보이지 않는|다른 계정의 권한|다시 관리자로/.test(description);
  const repeated = Number(data.count) >= 2 && /관리자 그룹/.test(description);
  const clear = relevant && account && level >= 10 && ((adminGroup && (unusual || repeated)) ||
    (command && unusual) || (/관리자 권한으로 바뀌었고/.test(description) && unusual));
  let confidence = 0.12;
  let reason = 'no_pattern_match';
  if (clear) {
    confidence = 0.94;
    reason = adminGroup ? PATTERNS[0].name : /시간 밖|업무처럼 보이지 않는/.test(description) ? PATTERNS[2].name : PATTERNS[1].name;
  } else if (relevant && account && level >= 5) {
    confidence = 0.60;
    reason = /그룹|계정 종류/.test(description) ? PATTERNS[0].name : PATTERNS[1].name;
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
