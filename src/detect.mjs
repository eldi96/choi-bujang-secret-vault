// 회수 제안만 반환합니다. 실제 접속 회수는 제공 엔진의 별도 처리입니다.
// 반 엔진이 검증한 사건만 전달해야 하며, 브라우저가 보낸 사용자 번호는 받지 않습니다.
export function readDetectionEvents(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');
  return events.map(event => {
    const at = event?.at;
    const method = event?.method;
    const sub = event?.identity?.sub;
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))
        || typeof method !== 'string' || !/^[A-Z]+$/u.test(method)
        || typeof sub !== 'string' || sub.length === 0 || sub.trim() !== sub) {
      // 오류에 사건 원문이나 입력값을 넣지 않습니다.
      throw new TypeError('invalid_detection_event');
    }
    // 필요한 세 값만 복사합니다. 원본 사건과 추가 필드는 보관하지 않습니다.
    return { at, method, identity: { sub } };
  });
}

export function detect(events) {
  const readsBySubject = new Map();
  for (const event of readDetectionEvents(events)) {
    if (event.method !== 'GET') continue;
    const subject = event.identity.sub;
    if (!readsBySubject.has(subject)) readsBySubject.set(subject, []);
    readsBySubject.get(subject).push(Date.parse(event.at));
  }
  const windowMs = 10 * 60 * 1000;
  for (const [subject, times] of readsBySubject) {
    times.sort((a, b) => a - b);
    let start = 0;
    for (let end = 0; end < times.length; end += 1) {
      while (times[end] - times[start] > windowMs) start += 1;
      if (end - start + 1 > 120) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }
  return { action: 'observe' };
}
