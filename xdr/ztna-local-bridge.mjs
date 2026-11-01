// XDR -> ZTNA 로컬 연동 검증기. 운영 ZTNA에 연결하거나 정책을 수정하지 않습니다.
// 신뢰할 수 있는 외부 검증 절차로 확인된 subjectId + deviceId 바인딩만 받습니다.
const SUBJECT = /^[a-zA-Z0-9_.:-]{1,128}$/;
const DEVICE = /^[a-f0-9]{16}$/;
const ALERT = /^(?:wi-\d{2,6}|bf-[a-zA-Z0-9_-]{1,32})$/;
const RULE = /^xdr\.(?:web-injection|brute-force)\./;

export function evaluateLocalBridge({ request, baseDecision, candidate, binding, now = Date.now() }) {
  if (!request || request.schema !== 'aleph.decision.v1' ||
      typeof request.requestId !== 'string' || !baseDecision ||
      baseDecision.schema !== 'aleph.decision.v1' ||
      baseDecision.requestId !== request.requestId ||
      !['allow','deny','step_up'].includes(baseDecision.decision) ||
      !Number.isFinite(now)) throw new TypeError('invalid local ZTNA input');

  // 기존 정책의 거부·추가 인증은 절대 허용으로 바꾸지 않습니다.
  if (baseDecision.decision !== 'allow') return {...baseDecision};
  // 바인딩은 호출자가 독립적인 신원/기기 검증을 수행한 경우에만 제공합니다.
  // 출발 IP·가상 경보 account만으로는 바인딩을 만들지 않습니다.
  const bound = binding?.verified === true &&
    SUBJECT.test(binding.subjectId ?? '') && DEVICE.test(binding.deviceId ?? '') &&
    binding.subjectId === request.subjectId && binding.deviceId === request.deviceId;
  const active = candidate?.status === 'pending_verified_binding' &&
    typeof candidate.ruleId === 'string' && RULE.test(candidate.ruleId) &&
    ALERT.test(candidate.alertId ?? '') &&
    candidate.ruleId.endsWith(candidate.alertId) &&
    typeof candidate.expiresAt === 'string' &&
    Number.isFinite(Date.parse(candidate.expiresAt)) && Date.parse(candidate.expiresAt) > now;
  if (!bound || !active || request.deviceRegistered !== true) return {...baseDecision};

  // 로컬 시험용 결과. 실제 운영 allowedReasonCodes에 추가하지 않습니다.
  return {
    schema: 'aleph.decision.v1', requestId: request.requestId,
    decision: 'deny', reasonCode: 'xdr_local_candidate', ruleIds: [candidate.ruleId],
  };
}

// 명령행 인수가 --self-test일 때만 가상 요청으로 검증합니다.
if (process.argv[1] && process.argv[1].endsWith('/local-bridge.mjs') &&
    process.argv.includes('--self-test')) {
  const request = {schema:'aleph.decision.v1',requestId:'local-test-1',
    subjectId:'subject-demo',deviceId:'1234567890abcdef',deviceRegistered:true};
  const baseDecision = {schema:'aleph.decision.v1',requestId:request.requestId,
    decision:'allow',reasonCode:'approved',ruleIds:['device_registered']};
  const candidate = {ruleId:'xdr.web-injection.wi-01',alertId:'wi-01',
    status:'pending_verified_binding',expiresAt:'2026-11-01T00:05:00.000Z'};
  const now = Date.parse('2026-11-01T00:00:00.000Z');
  const binding = {verified:true,subjectId:request.subjectId,deviceId:request.deviceId};
  const checks = [
    ['verified_attack_denied',evaluateLocalBridge({request,baseDecision,candidate,binding,now}).decision === 'deny'],
    ['unverified_normal_allowed',evaluateLocalBridge({request,baseDecision,candidate,binding:{...binding,verified:false},now}).decision === 'allow'],
    ['other_device_allowed',evaluateLocalBridge({request:{...request,deviceId:'aaaaaaaaaaaaaaaa'},baseDecision,candidate,binding,now}).decision === 'allow'],
    ['expired_candidate_allowed',evaluateLocalBridge({request,baseDecision,candidate,binding,now:now+360000}).decision === 'allow'],
    ['existing_deny_preserved',evaluateLocalBridge({request,baseDecision:{...baseDecision,decision:'deny'},candidate,binding,now}).decision === 'deny'],
  ];
  for (const [name,ok] of checks) console.log(`${ok?'PASS':'FAIL'} ${name}`);
  if (checks.some(([,ok])=>!ok)) process.exitCode = 1;
}
