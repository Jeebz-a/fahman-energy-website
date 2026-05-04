// /api/admin/messages/[id]
//   GET    → full message + replies. Auto-marks 'unread' → 'read'.
//   PATCH  → { status: 'read' | 'unread' | 'archived' }
//   DELETE → permanently deletes the message and its replies.

import { verifySession } from '../_lib/auth.js';
import { getMessage, setMessageStatus, deleteMessage } from '../_lib/db.js';

const VALID_STATUSES = new Set(['unread', 'read', 'replied', 'archived']);

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const session = verifySession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid message id' });
  }

  try {
    if (req.method === 'GET') {
      const data = await getMessage(id);
      if (!data) return res.status(404).json({ ok: false, error: 'Not found' });
      // Auto-mark as read on first open.
      if (data.message.status === 'unread') {
        try { await setMessageStatus(id, 'read'); data.message.status = 'read'; } catch {}
      }
      return res.status(200).json({ ok: true, ...data });
    }

    if (req.method === 'PATCH') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
      }
      const status = String(body?.status || '');
      if (!VALID_STATUSES.has(status)) {
        return res.status(400).json({ ok: false, error: `Status must be one of: ${[...VALID_STATUSES].join(', ')}` });
      }
      const updated = await setMessageStatus(id, status);
      if (!updated) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.status(200).json({ ok: true, ...updated });
    }

    if (req.method === 'DELETE') {
      const deleted = await deleteMessage(id);
      if (!deleted) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.status(200).json({ ok: true, deletedId: deleted.id });
    }

    res.setHeader('Allow', 'GET, PATCH, DELETE');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/messages/:id] error', err);
    return res.status(500).json({ ok: false, error: 'Database error', detail: err.message });
  }
}
