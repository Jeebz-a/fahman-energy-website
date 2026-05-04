// POST /api/admin/logout — clear session cookie.

import { buildClearCookie } from './_lib/auth.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Set-Cookie', buildClearCookie());
  return res.status(200).json({ ok: true });
}
