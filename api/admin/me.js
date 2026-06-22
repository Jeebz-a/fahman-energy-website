// /api/admin/me
//   GET  → { ok, username } if signed in, 401 otherwise
//   POST → log out (clears the session cookie)
// (logout is folded in here to stay within Vercel's serverless-function limit.)

import { verifySession, buildClearCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', buildClearCookie());
    return res.status(200).json({ ok: true, loggedOut: true });
  }

  const session = verifySession(req);
  if (!session) return res.status(401).json({ ok: false });
  return res.status(200).json({ ok: true, username: session.username, expires: session.expires });
}
