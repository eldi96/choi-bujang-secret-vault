import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { readDeviceApproval, sameOrigin, authorizationOf } from '../src/device-approval.mjs';

export function createDeviceHandler({ verify, client }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Vary', 'Cookie, Authorization');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'method_not_allowed' });
    if (req.method === 'POST' && !sameOrigin(req)) return res.status(403).json({ error: 'origin_denied' });
    try {
      const verified = await verify(authorizationOf(req));
      if (!verified) return res.status(401).json({ error: 'login_required' });
      if (req.method === 'POST') {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        // 자기 승인·기기 번호·역할 주장을 받지 않습니다.
        if (body && (typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length)) {
          return res.status(400).json({ error: 'approval_fields_not_accepted' });
        }
      }
      const result = await readDeviceApproval(client, verified, req.method === 'POST');
      return res.status(result.status === 'session_unavailable' ? 403 : 200).json(result);
    } catch {
      return res.status(503).json({ error: 'device_registry_unavailable', registered: false });
    }
  };
}
export default async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'device_registry_unavailable', registered: false });
  }
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return createDeviceHandler({ client, verify: createLoginVerifier({ config, supabaseSecretKey: key }) })(req, res);
}
