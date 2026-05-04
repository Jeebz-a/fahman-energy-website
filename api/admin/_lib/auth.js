// Shared auth helpers for /api/admin/* routes.
// Files in folders starting with _ are NOT exposed as Vercel routes.

import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'fe_admin';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Constant-time string compare. Returns false for length mismatches without
 * leaking length info via early-return timing.
 */
export function safeStringEq(a, b) {
  const ab = Buffer.from(String(a ?? ''), 'utf8');
  const bb = Buffer.from(String(b ?? ''), 'utf8');
  if (ab.length !== bb.length) {
    // dummy compare so timing doesn't leak which one was longer
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/**
 * Build a session cookie value for `username`.
 * Format: <expiresMs>.<urlEncodedUsername>.<hmacHex>
 */
export function signSession(username, expiresMs) {
  const secret = process.env.BLOG_ADMIN_SESSION_SECRET || '';
  if (!secret) throw new Error('BLOG_ADMIN_SESSION_SECRET not set');
  const payload = `${expiresMs}:${username}`;
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${expiresMs}.${encodeURIComponent(username)}.${sig}`;
}

/**
 * Parse + verify a session cookie. Returns { username, expires } or null.
 */
export function verifySession(req) {
  const secret = process.env.BLOG_ADMIN_SESSION_SECRET || '';
  if (!secret) return null;

  const cookies = parseCookies(req.headers?.cookie || '');
  const token = cookies[COOKIE_NAME];
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [expiresStr, encodedUser, sig] = parts;

  const expires = Number(expiresStr);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;

  const username = decodeURIComponent(encodedUser);
  const expected = createHmac('sha256', secret).update(`${expires}:${username}`).digest('hex');

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  return { username, expires };
}

/**
 * Wrap a handler so it 401s if there's no valid session.
 */
export function requireAuth(handler) {
  return async (req, res) => {
    const session = verifySession(req);
    if (!session) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    req.session = session;
    return handler(req, res);
  };
}

export function buildSessionCookie(token, { maxAgeSec = SESSION_TTL_MS / 1000 } = {}) {
  return [
    `${COOKIE_NAME}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${Math.floor(maxAgeSec)}`,
  ].join('; ');
}

export function buildClearCookie() {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
  ].join('; ');
}

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const piece of header.split(';')) {
    const idx = piece.indexOf('=');
    if (idx < 0) continue;
    const k = piece.slice(0, idx).trim();
    const v = piece.slice(idx + 1).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(v); } catch { out[k] = v; }
  }
  return out;
}
