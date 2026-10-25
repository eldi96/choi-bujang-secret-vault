import { randomInt, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import config from '../aleph.config.json' with { type: 'json' };
import { createLoginVerifier } from '../src/verify-login.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let verifier;
function getVerifier(key) {
  if (!verifier) verifier = createLoginVerifier({ config, supabaseSecretKey: key });
  return verifier;
}
function bodyOf(req) {
  if (typeof req.body === 'string') return JSON.parse(req.body);
  return req.body;
}
function validText(value, limit) {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
function sendDbError(res, error) {
  return res.status(502).json({ error: 'Could not process note' });
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (!['GET', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return res.status(503).json({ error: 'Server not configured' });

  try {
    const verified = await getVerifier(key)(req.headers.authorization);
    if (!verified) return res.status(401).json({ error: 'Login required or invalid token' });
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const rawId = req.query?.id;
    const noteId = Array.isArray(rawId) ? null : rawId;
    if (noteId !== undefined && (!noteId || !UUID.test(noteId))) {
      return res.status(400).json({ error: 'Invalid note id' });
    }
    const table = client.from('vault_notes');

    if (req.method === 'GET' && !noteId) {
      const { data, error } = await table.select('public_id,title,content').order('id');
      if (error) return sendDbError(res, error);
      return res.status(200).json({ notes: data.map(n => ({ id: n.public_id, title: n.title, body: n.content })) });
    }
    if (req.method === 'GET') {
      const { data, error } = await table.select('public_id,title,content').eq('public_id', noteId).maybeSingle();
      if (error) return sendDbError(res, error);
      if (!data) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ id: data.public_id, title: data.title, body: data.content });
    }
    if (req.method === 'POST' && !noteId) {
      const input = bodyOf(req);
      if (!input || !validText(input.title, 200) || !validText(input.body, 10000)
          || (input.id !== undefined && (typeof input.id !== 'string' || !UUID.test(input.id)))) {
        return res.status(400).json({ error: 'Invalid note' });
      }
      const id = input.id ?? randomUUID();
      // The starter table has a bigint primary key without an auto-number default.
      // Assign a cryptographically random safe integer; never alter existing IDs.
      const legacyId = randomInt(1_000_000_000, Number.MAX_SAFE_INTEGER);
      const { error } = await table.insert({
        id: legacyId, public_id: id, title: input.title,
        content: input.body, owner_id: verified.userId
      });
      if (error) {
        if (error.code === '23505') return res.status(409).json({ error: 'Note id already exists' });
        return sendDbError(res, error);
      }
      return res.status(201).json({ id });
    }
    if (!noteId) return res.status(405).json({ error: 'Method not allowed' });
    if (req.method === 'PUT') {
      const input = bodyOf(req);
      if (!input || !validText(input.title, 200) || !validText(input.body, 10000)) {
        return res.status(400).json({ error: 'Invalid note' });
      }
      // Stage 3 intentionally does not check ownership. Stage 4 must add it.
      const { data, error } = await table.update({
        title: input.title, content: input.body
      }).eq('public_id', noteId).select('public_id,title,content').maybeSingle();
      if (error) return sendDbError(res, error);
      if (!data) return res.status(404).json({ error: 'Note not found' });
      return res.status(200).json({ id: data.public_id, title: data.title, body: data.content });
    }
    // Stage 3 intentionally does not check ownership. Stage 4 must add it.
    const { data, error } = await table.delete().eq('public_id', noteId).select('public_id').maybeSingle();
    if (error) return sendDbError(res, error);
    if (!data) return res.status(404).json({ error: 'Note not found' });
    return res.status(200).json({ id: data.public_id });
  } catch {
    return res.status(500).json({ error: 'Internal server error' });
  }
}
