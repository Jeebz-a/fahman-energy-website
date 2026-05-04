// /api/admin/messages — admin inbox list endpoint.
//
//   GET /api/admin/messages              → list all messages (most recent 200)
//   GET /api/admin/messages?status=unread → filter by status
//   GET /api/admin/messages?count=unread  → just the unread count, e.g. {ok,unread:3}
//
// Auth required.

import { verifySession } from './_lib/auth.js';
import { listMessages, countByStatus } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const session = verifySession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const url = new URL(req.url, 'http://x');
  const countParam = url.searchParams.get('count');
  const status = url.searchParams.get('status');

  try {
    if (countParam) {
      // Allow ?count=unread or ?count=read etc.
      const c = await countByStatus(countParam);
      return res.status(200).json({ ok: true, status: countParam, count: c, [countParam]: c });
    }

    const messages = await listMessages({ status: status || null });
    return res.status(200).json({ ok: true, messages });
  } catch (err) {
    console.error('[admin/messages] error', err);
    return res.status(500).json({ ok: false, error: 'Database error', detail: err.message });
  }
}
