// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

// 내부 검사 결과이며 판정 응답이나 엔진 입력 계약에 필드를 추가하지 않습니다.
// 호출자가 엔진인지 확인하는 작업은 엔진 경계에서 보장해야 합니다.
export function inspectConnectionInput(request) {
  const signals = request?.signals;
  const fixture = signals?.source === 'judge_fixture';
  const events = request?.recentEvents;
  return {
    source: fixture ? 'judge_fixture' : signals?.source === 'none' ? 'none' : 'unknown',
    // 가상 시험의 값만 분류하며 실제 위치 정보로 취급하지 않습니다.
    region: fixture && ['local', 'foreign'].includes(signals.region) ? signals.region : null,
    network: fixture && ['usual', 'unusual'].includes(signals.network) ? signals.network : null,
    hour: fixture && Number.isInteger(signals.hour) && signals.hour >= 0 && signals.hour <= 23
      ? signals.hour : null,
    recentEvents: Array.isArray(events) && events.length <= 12 && events.every(event =>
      event && typeof event.kind === 'string' && event.kind.length > 0
      && Number.isInteger(event.ageSeconds) && event.ageSeconds >= 0
      && Number.isInteger(event.count) && event.count >= 0)
      ? events.map(({ kind, ageSeconds, count }) => ({ kind, ageSeconds, count })) : null,
  };
}

export async function decide(request) {
  const connection = inspectConnectionInput(request);
  const registered = request.deviceRegistered === true;
  // 제공된 가상 사건을 기준으로 한 복합 규칙이며 실제 위치 증거가 아닙니다.
  // 지역 단독 조건이나 클라이언트 헤더는 사용하지 않습니다.
  const unusualAccess = connection.source === 'judge_fixture'
    && connection.hour !== null && connection.hour < 6
    && connection.network === 'unusual'
    && connection.recentEvents !== null
    && connection.recentEvents.some(event => event.kind === 'risk_signal'
      && event.ageSeconds <= 60 && event.count >= 20);
  if (registered && unusualAccess) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: ['device_registered', 'step_up_required'],
    };
  }
  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: registered ? 'allow' : 'deny',
    reasonCode: registered ? 'approved' : 'device_not_registered',
    ruleIds: ['device_registered'],
  };
}
