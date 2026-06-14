// /api/admin/gas-alerts — refill-reminder subscribers (auth required).
//   GET                  → { ok, stats, subscribers: [...] }
//   GET ?format=csv      → CSV download of all subscribers
//   GET ?count=1         → just the stats summary
//   DELETE ?id=123       → remove a subscriber

import { verifySession } from './_lib/auth.js';
import { listGasAlerts, gasAlertStats, deleteGasAlert } from './_lib/db.js';

export default async function handler(req, res) {
  const session = verifySession(req);
  if (!session) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const stats = await gasAlertStats();

      if (url.searchParams.get('count')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ ok: true, stats });
      }

      const subscribers = await listGasAlerts({ status: url.searchParams.get('status') || null });

      if (url.searchParams.get('format') === 'csv') {
        const header = 'id,name,email,cylinder_kg,daily_kg,days_left,run_out,remind_on,status,created_at\n';
        const esc = (v) => {
          const s = v == null ? '' : String(v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        const body = subscribers.map((r) => [
          r.id, r.name, r.email, r.cylinder_kg, r.daily_kg, r.days_left,
          r.run_out, r.remind_on, r.status, r.created_at,
        ].map(esc).join(',')).join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Disposition', `attachment; filename="gas-reminder-subscribers-${new Date().toISOString().slice(0,10)}.csv"`);
        return res.status(200).send(header + body + '\n');
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, stats, subscribers });
    }

    if (req.method === 'DELETE') {
      const url = new URL(req.url, 'http://x');
      const id = Number(url.searchParams.get('id'));
      if (!Number.isInteger(id) || id <= 0) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }
      const del = await deleteGasAlert(id);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      if (!del) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.status(200).json({ ok: true, deletedId: del.id });
    }

    res.setHeader('Allow', 'GET, DELETE');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/gas-alerts] error', err);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(500).json({ ok: false, error: 'Database error', detail: err.message });
  }
}
