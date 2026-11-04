import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';
import { createOperationsHandler } from '../src/operations.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(503).json({ error: 'operations_not_configured' });
  return createOperationsHandler({
    config, version: process.env.VERCEL_GIT_COMMIT_SHA,
    backupConfigured: Boolean(process.env.RESTORE_NOTE_BACKUP_JSON && process.env.RESTORE_NOTE_CONTENT_SHA256),
    verify: createLoginVerifier({ config, supabaseSecretKey: key }),
    client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
  })(req, res);
}
