import { createClient } from '@supabase/supabase-js';

const ACCESS = '__Host-aleph_access';
const REFRESH = '__Host-aleph_refresh';
const COOKIE_OPTIONS = 'Path=/; Secure; HttpOnly; SameSite=Strict';
function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    try { result[name] = decodeURIComponent(part.slice(index + 1).trim()); } catch {}
  }
  return result;
}
function setSession(res, session) {
  const maxAge = Math.max(1, Math.min(3600, session.expires_in || 3600));
  res.setHeader('Set-Cookie', [
    `${ACCESS}=${encodeURIComponent(session.access_token)}; ${COOKIE_OPTIONS}; Max-Age=${maxAge}`,
    `${REFRESH}=${encodeURIComponent(session.refresh_token)}; ${COOKIE_OPTIONS}; Max-Age=604800`,
  ]);
}
function clearSession(res) {
  res.setHeader('Set-Cookie', [
    `${ACCESS}=; ${COOKIE_OPTIONS}; Max-Age=0`,
    `${REFRESH}=; ${COOKIE_OPTIONS}; Max-Age=0`,
  ]);
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (typeof origin !== 'string' || !host || !/^https:\/\//.test(origin)) return false;
  try { return new URL(origin).host === host && new URL(origin).protocol === 'https:'; } catch { return false; }
}
function body(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Vary', 'Cookie');
  if (!['GET', 'POST', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  if (req.method !== 'GET' && !sameOrigin(req)) return res.status(403).json({ error: 'Origin denied' });
  const supabase = client();
  if (!supabase) return res.status(503).json({ error: 'Server not configured' });
  const saved = cookies(req);
  try {
    if (req.method === 'POST') {
      const input = body(req);
      if (!input || typeof input.email !== 'string' || typeof input.password !== 'string'
          || input.email.length > 254 || input.password.length > 1024) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }
      const { data, error } = await supabase.auth.signInWithPassword({ email: input.email, password: input.password });
      if (error || !data.session) return res.status(401).json({ error: 'Invalid credentials' });
      setSession(res, data.session);
      return res.status(200).json({ email: data.user?.email ?? null });
    }
    if (req.method === 'DELETE') {
      // Invalidate the current refresh token where possible; always clear browser cookies.
      if (saved[ACCESS]) await supabase.auth.admin.signOut(saved[ACCESS], 'local').catch(() => {});
      clearSession(res);
      return res.status(200).json({ loggedOut: true });
    }
    if (saved[ACCESS]) {
      const { data, error } = await supabase.auth.getUser(saved[ACCESS]);
      if (!error && data.user) return res.status(200).json({ email: data.user.email ?? null });
    }
    if (saved[REFRESH]) {
      const { data, error } = await supabase.auth.refreshSession({ refresh_token: saved[REFRESH] });
      if (!error && data.session && data.user) {
        setSession(res, data.session);
        return res.status(200).json({ email: data.user.email ?? null });
      }
    }
    clearSession(res);
    return res.status(401).json({ error: 'Login required' });
  } catch {
    return res.status(500).json({ error: 'Authentication unavailable' });
  }
}
