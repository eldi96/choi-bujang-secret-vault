import { createHash, randomUUID } from 'node:crypto';
import { RULE_IDS } from './decider.mjs';
import { readDeviceApproval, authorizationOf } from './device-approval.mjs';
import { verificationPlan } from './verification-plan.mjs';

// 집계 저장소가 연결되지 않은 값은 0이나 성공으로 바꾸지 않습니다.
export function createOperationsHandler({ verify, client, config, version, backupConfigured,
  log = line => console.info(line), now = () => new Date().toISOString() }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
    let user;
    try { user = await verify(authorizationOf(req)); }
    catch { return res.status(503).json({ error: 'login_verification_unavailable' }); }
    if (!user || user.kind !== 'student') return res.status(401).json({ error: 'login_required' });
    // 현재 세션의 상태만 읽습니다. 다른 학생·전체 서버 사건은 조회하지 않습니다.
    let approval;
    try {
      const result = await readDeviceApproval(client, user);
      approval = { evidence: 'api_confirmed', status: result.status, registered: result.registered };
    } catch {
      approval = { evidence: 'unavailable', status: 'registry_unavailable', registered: null };
    }
    const summary = {
      rules: { evidence: 'configuration_only', ids: [...RULE_IDS], count: RULE_IDS.length,
        step: config.step, executionCount: null },
      detection: { evidence: 'not_connected', eventCount: null, proposalCount: null },
      revocation: { evidence: 'not_connected', executedCount: null, approval },
      recovery: { evidence: 'not_connected', deployedVersion: /^[a-f0-9]{40}$/i.test(version ?? '') ? version : null,
        backupConfigured: Boolean(backupConfigured), restoredVersion: null, verifiedCount: null },
      finalAssault: { evidence: 'not_connected', step12Passed: null, defended: null, total: 41 },
      verification: { source: 'plan_only', rows: verificationPlan() },
    };
    const record = { schema: 'aleph.operations.v1', evidenceId: randomUUID(), checkedAt: now(),
      scope: 'current_session', summary };
    const digest = createHash('sha256').update(JSON.stringify(record)).digest('hex');
    const response = { ...record, digest };
    // 허용 목록으로 만든 응답과 동일한 기록만 출력합니다. UID·세션·본문·키는 포함하지 않습니다.
    try { log(JSON.stringify({ event: 'operations_summary', ...response })); }
    catch { return res.status(503).json({ error: 'evidence_log_unavailable' }); }
    return res.status(200).json(response);
  };
}
