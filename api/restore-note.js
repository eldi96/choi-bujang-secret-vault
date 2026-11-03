import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

export const contentHash = (title, body) => createHash('sha256')
  .update(JSON.stringify([title, body]), 'utf8').digest('hex');

export function createRestoreHandler({ verify, client, backup, expectedHash }) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const fail = (status, reasonCode) => res.status(status).json({ error: reasonCode });
    if (req.method !== 'POST') return fail(405, 'method_not_allowed');
    try {
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!backup || !uuid.test(backup.id ?? '') || !uuid.test(backup.ownerId ?? '')
          || typeof backup.title !== 'string' || typeof backup.body !== 'string'
          || !/^[a-f0-9]{64}$/.test(expectedHash ?? '')
          || contentHash(backup.title, backup.body) !== expectedHash) return fail(503, 'backup_integrity_failed');
      // 복원 대상은 서버 비공개 사본으로 고정하며 요청에서 선택하지 않습니다.
      const TARGET = backup.id;
      const OWNER = backup.ownerId;
      let authorization = req.headers.authorization;
      if (!authorization) {
        const cookie = (req.headers.cookie || '').split(';').map(x => x.trim())
          .find(x => x.startsWith('__Host-aleph_access='));
        if (cookie) {
          if (req.headers.origin !== new URL(config.publicAppUrl).origin) return fail(403, 'origin_denied');
          authorization = 'Bearer ' + decodeURIComponent(cookie.slice('__Host-aleph_access='.length));
        }
      }
      const user = await verify(authorization);
      if (!user || user.kind !== 'student' || user.userId !== OWNER) return fail(403, 'restore_owner_required');
      const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!input || Object.keys(input).length !== 1 || input.id !== TARGET) return fail(400, 'fixed_target_required');
      const { data: before, error } = await client.from('vault_notes')
        .select('public_id,owner_id,title,content').eq('public_id', TARGET).eq('owner_id', OWNER).maybeSingle();
      if (error) return fail(502, 'restore_read_failed');
      if (!before || before.public_id !== TARGET || before.owner_id !== OWNER) return fail(409, 'target_owner_mismatch');
      // ID·소유자를 바꾸지 않습니다. 읽은 뒤 변경된 메모는 덮어쓰지 않습니다.
      const { data: after, error: updateError } = await client.from('vault_notes')
        .update({ title: backup.title, content: backup.body })
        .eq('public_id', TARGET).eq('owner_id', OWNER)
        .eq('title', before.title).eq('content', before.content)
        .select('public_id,owner_id,title,content').maybeSingle();
      if (updateError) return fail(502, 'restore_write_failed');
      if (!after || after.public_id !== TARGET || after.owner_id !== OWNER
          || contentHash(after.title, after.content) !== expectedHash) return fail(409, 'restore_verification_failed');
      return res.status(200).json({ restored: true, id: TARGET, ownerId: OWNER, contentHash: expectedHash });
    } catch {
      return fail(400, 'restore_request_failed');
    }
  };
}

export default async function handler(req, res) {
  // 비공개 사본과 독립적인 기준 해시는 서버 설정에서만 읽습니다.
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  try {
    if (!url || !key || !process.env.RESTORE_NOTE_BACKUP_JSON) throw new Error();
    const backup = JSON.parse(process.env.RESTORE_NOTE_BACKUP_JSON);
    return await createRestoreHandler({
      verify: createLoginVerifier({ config, supabaseSecretKey: key }),
      client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
      backup, expectedHash: process.env.RESTORE_NOTE_CONTENT_SHA256,
    })(req, res);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'restore_not_configured' });
  }
}
