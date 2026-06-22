// GET /api/gas-price — public. Returns FahmanEnergy's current retail gas prices.
// Cached at the edge for 10 minutes (prices change rarely).

import { getGasPrices } from './admin/_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  try {
    const { prices, updatedAt } = await getGasPrices();
    // s-maxage lets Vercel's edge cache it; stale-while-revalidate keeps it snappy.
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=600, stale-while-revalidate=86400');
    return res.status(200).json({
      ok: true,
      currency: 'NGN',
      region: 'Kwara State, Nigeria',
      updatedAt,
      prices: prices.map((p) => ({ key: p.item_key, label: p.label, amount: p.amount, unit: p.unit })),
    });
  } catch (err) {
    console.error('[gas-price] error', err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false, error: 'Could not load prices' });
  }
}
