// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 요청 본문의 userId, role, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required', 'resource_zone']);

function allowedZone(request) {
  // 기능 선택 쿼리는 지원하지 않습니다. 경로·메서드·엔진 경로 모양이 모두 맞아야 합니다.
  if (request.queryLength !== 0 || typeof request.path !== 'string') return false;
  const { service, method, path, route } = request;
  if (service === 'notes' && ['GET', 'PUT', 'DELETE'].includes(method)) {
    const match = /^(\/api\/notes|\/notes)\/([^/]+)$/.exec(path);
    if (!match || route !== `${method} ${match[1]}/:id`) return false;
    const id = match[2];
    // ID를 UUID로 제한하지 않고 모호한 경로와 예약된 기능 이름을 거부합니다.
    return !/[\\%?#\s\u0000-\u001f\u007f]/u.test(id)
      && !['.', '..', ':id', 'export', 'import', 'search', 'bulk', 'all', 'list', 'admin'].includes(id.toLowerCase());
  }
  if (service === 'notices' && method === 'GET') {
    return ['/notices', '/api/notices'].some(base =>
      path === base && route === `GET ${base}`);
  }
  // 역할을 추측하지 않습니다. 강사 자료·관리 경로와 미등록 서비스는 전부 거부합니다.
  return false;
}

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
  if (registered && !allowedZone(request)) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'route_not_allowed',
      ruleIds: ['resource_zone'],
    };
  }
  // 제공된 가상 사건을 기준으로 한 복합 규칙이며 실제 위치 증거가 아닙니다.
  // 지역 단독 조건이나 클라이언트 헤더는 사용하지 않습니다.
  const unusualAccess = connection.source === 'judge_fixture'
    && connection.hour !== null && connection.hour < 6
    && connection.network === 'unusual'
    && connection.recentEvents !== null
    && connection.recentEvents.some(event => event.kind === 'risk_signal'
      && event.ageSeconds <= 60 && event.count >= 20);
  // 엔진이 검증해 전달한 재확인 결과만 사용합니다. 토큰 발급 시각이나
  // 브라우저의 로그인 주장은 사용하지 않으며, 기기 검사를 우회하지 않습니다.
  const reverified = request.stepUp?.verified === true
    && Number.isInteger(request.stepUp.authAgeSeconds)
    && request.stepUp.authAgeSeconds >= 0
    && request.stepUp.authAgeSeconds <= 900;
  if (registered && unusualAccess && !reverified) {
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
