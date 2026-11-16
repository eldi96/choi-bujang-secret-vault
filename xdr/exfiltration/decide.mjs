const PATTERNS = Object.freeze([
  { name: 'large-transfer-unfamiliar-destination', condition: '평소 목록에 없는 외부 목적지로 평소보다 큰 자료 전송이 관찰됨', evidence: 'T1041과 T1048은 외부로 자료를 유출하는 통로를 설명하며, 크기와 목적지 자체만으로 어느 기법인지 확정할 수 없음.' },
  { name: 'after-hours-archive-transfer', condition: '평소 업무 시간 밖에 압축 파일이 외부 목적지로 전송됨', evidence: 'T1560: 공격자는 자료를 유출하기 전에 압축할 수 있으나 시간과 압축만으로 악의적 전송을 확정할 수 없음.' },
  { name: 'exfiltration-over-c2-channel', condition: '자료가 확인된 기존 명령·제어 통로를 통해 외부로 전송됨', evidence: 'T1041: 기존 명령·제어 통로를 이용해 자료를 유출할 수 있음.' },
  { name: 'exfiltration-over-alternative-protocol', condition: '자료가 확인된 명령·제어 통로와 다른 프로토콜로 외부에 전송됨', evidence: 'T1048: 명령·제어 통로와 다른 프로토콜을 이용해 자료를 유출할 수 있음.' },
]);

export function decide(alert) {
  const rule = alert?.rule ?? {};
  const data = alert?.data ?? {};
  const description = typeof rule.description === 'string' ? rule.description : '';
  const level = Number.isInteger(rule.level) ? rule.level : -1;
  const relevant = Array.isArray(rule.mitre) && rule.mitre.some(x => ['T1041', 'T1048'].includes(x));
  const destination = typeof data.dstip === 'string' && data.dstip.length > 0;
  const bytes = typeof data.bytes === 'string' && /^\d+$/.test(data.bytes) ? Number(data.bytes) : data.bytes;
  const large = Number.isSafeInteger(bytes) && bytes >= 70000000;
  const strongSignal = /처음 보는|반복|연속|쓰지 않던 포트|업무 시간 밖|자료실 전체/.test(description);
  const clear = relevant && destination && level >= 10 && large && strongSignal;
  let confidence = 0.12;
  let reason = 'no_pattern_match';
  if (clear || (relevant && level >= 5)) {
    confidence = clear ? 0.94 : 0.60;
    reason = /명령 통로/.test(description) ? PATTERNS[2].name :
      /압축/.test(description) && /시간 밖/.test(description) ? PATTERNS[1].name : PATTERNS[0].name;
  }
  return { action: confidence >= 0.85 ? 'block' : confidence >= 0.5 ? 'alert' : 'record', confidence, reason };
}
