// POST /api/admin/login
// Body: { username, password }
// Response: 200 { ok: true } + Set-Cookie session
//           401 { ok: false, error } on bad creds

import {
  safeStringEq,
  signSession,
  buildSessionCookie,
  SESSION_TTL_MS,
} from './_lib/auth.js';

// Tiny in-memory rate limit (per cold function instance).
// Not a hard guarantee — Vercel spawns multiple instances — but enough to
// take the edge off opportunistic credential-stuffing.
const HITS = new Map();
const WINDOW_MS = 60_000;
const MAX_HITS = 8;

function rateLimited(ip) {
  const now = Date.now();
  const arr = (HITS.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  HITS.set(ip, arr);
  return arr.length > MAX_HITS;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'unknown';
  if (rateLimited(ip)) {
    return res.status(429).json({ ok: false, error: 'Too many attempts. Try again in a minute.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
  }
  const { username = '', password = '' } = body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, error: 'Missing credentials' });
  }

  const expectedUser = process.env.BLOG_ADMIN_USERNAME || '';
  const expectedPass = process.env.BLOG_ADMIN_PASSWORD || '';
  const secret = process.env.BLOG_ADMIN_SESSION_SECRET || '';

  if (!expectedUser || !expectedPass || !secret) {
    console.error('[admin/login] server not configured (missing env vars)');
    return res.status(500).json({ ok: false, error: 'Server not configured' });
  }

  const userOk = safeStringEq(username, expectedUser);
  const passOk = safeStringEq(password, expectedPass);
  if (!userOk || !passOk) {
    // small artificial delay to dampen brute force
    await new Promise((r) => setTimeout(r, 300));
    return res.status(401).json({ ok: false, error: 'Invalid username or password' });
  }

  const expires = Date.now() + SESSION_TTL_MS;
  const token = signSession(username, expires);
  res.setHeader('Set-Cookie', buildSessionCookie(token));
  return res.status(200).json({ ok: true, username });
}
