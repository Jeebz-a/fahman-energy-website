// /api/admin/gas-prices (auth)
//   GET  → { ok, prices:[...], updatedAt }   (full rows for the editor)
//   POST → { items: [{ item_key, amount }] } → saves, returns updated count

import { verifySession } from './_lib/auth.js';
import { getGasPrices, setPerKgPrice } from './_lib/db.js';

function ok(res, p) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, ...p }); }
function fail(res, s, e) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(s).json({ ok: false, error: e }); }

export default async function handler(req, res) {
  const session = verifySession(req);
  if (!session) return fail(res, 401, 'Unauthorized');

  try {
    if (req.method === 'GET') {
      const { prices, perKg, updatedAt } = await getGasPrices();
      return ok(res, { perKg, prices, updatedAt });
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); } }
      const perKg = Number(body?.perKg);
      if (!Number.isFinite(perKg) || perKg <= 0 || perKg > 1000000) return fail(res, 400, 'Enter a valid price per kg');
      await setPerKgPrice(perKg, session.username);
      const { prices, perKg: saved, updatedAt } = await getGasPrices();
      return ok(res, { perKg: saved, prices, updatedAt });
    }

    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Method not allowed');
  } catch (err) {
    console.error('[admin/gas-prices] error', err);
    return fail(res, 500, 'Database error');
  }
}
