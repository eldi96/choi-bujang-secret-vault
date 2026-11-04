// 로그인 검증 후 얻은 세션에만 연결합니다. 브라우저의 승인 주장·기기 ID는 읽지 않습니다.
export async function readDeviceApproval(client, verified, request = false) {
  if (verified?.kind !== 'student' || !verified.sessionId) {
    return { status: 'session_unavailable', registered: false };
  }
  const { data, error } = await client.rpc('vault_device_access', {
    p_user: verified.userId, p_session: verified.sessionId, p_request: request,
  });
  if (error || !data || !['not_requested', 'pending', 'approved', 'rejected', 'revoked', 'expired', 'session_invalid'].includes(data.status)
      || typeof data.registered !== 'boolean') throw new Error('device_registry_unavailable');
  return {
    status: data.status,
    registered: data.status === 'approved' && data.registered === true,
    ...(typeof data.requestId === 'string' ? { requestId: data.requestId } : {}),
  };
}

export function sameOrigin(req) {
  try {
    const url = new URL(req.headers.origin);
    return url.protocol === 'https:' && url.host === req.headers.host;
  } catch { return false; }
}
export function authorizationOf(req) {
  if (req.headers.authorization) return req.headers.authorization;
  const cookie = (req.headers.cookie || '').split(';').map(x => x.trim())
    .find(x => x.startsWith('__Host-aleph_access='));
  try { return cookie ? 'Bearer ' + decodeURIComponent(cookie.slice('__Host-aleph_access='.length)) : null; }
  catch { return null; }
}
