// GET /api/admin/me — returns { ok, username } if signed in, 401 otherwise.

import { verifySession } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const session = verifySession(req);
  if (!session) return res.status(401).json({ ok: false });
  return res.status(200).json({ ok: true, username: session.username, expires: session.expires });
}
