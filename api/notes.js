
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

let verifier;
function getVerifier(key) {
  if (!verifier) verifier = createLoginVerifier({ config, supabaseSecretKey: key });
  return verifier;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;

  if (!url || !key) {
    return res.status(503).json({ error: 'Server not configured' });
  }

  try {
    const verified = await getVerifier(key)(req.headers.authorization);
    if (!verified) return res.status(401).json({ error: 'Login required or invalid token' });
    const client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });

    const { data, error } = await client
      .from('vault_notes')
      .select('title, content')
      .order('id');

    if (error) {
      return res.status(502).json({ error: 'Could not load notes' });
    }

    return res.status(200).json({ notes: data });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
