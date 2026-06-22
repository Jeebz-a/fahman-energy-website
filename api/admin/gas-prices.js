// /api/admin/gas-prices (auth)
//   GET  → { ok, prices:[...], updatedAt }   (full rows for the editor)
//   POST → { items: [{ item_key, amount }] } → saves, returns updated count

import { verifySession } from './_lib/auth.js';
import { getGasPrices, saveGasPrices } from './_lib/db.js';

function ok(res, p) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, ...p }); }
function fail(res, s, e) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(s).json({ ok: false, error: e }); }

export default async function handler(req, res) {
  const session = verifySession(req);
  if (!session) return fail(res, 401, 'Unauthorized');

  try {
    if (req.method === 'GET') {
      const { prices, updatedAt } = await getGasPrices();
      return ok(res, { prices, updatedAt });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); } }
      const items = Array.isArray(body?.items) ? body.items : null;
      if (!items || !items.length) return fail(res, 400, 'No items to update');
      // Basic sanity: cap absurd values.
      for (const it of items) {
        const a = Number(it.amount);
        if (!Number.isFinite(a) || a < 0 || a > 100000000) return fail(res, 400, `Invalid amount for ${it.item_key}`);
      }
      const n = await saveGasPrices(items, session.username);
      const { prices, updatedAt } = await getGasPrices();
      return ok(res, { updated: n, prices, updatedAt });
    }

    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('[admin/gas-prices] error', err);
    return fail(res, 500, 'Database error');
  }
}
