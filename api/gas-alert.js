// POST /api/gas-alert
// Captures a refill-reminder signup from the gas calculator, stores it,
// and sends an immediate confirmation email via Resend.
//
// Body: { name?, email, cylinderKg?, dailyKg?, daysLeft?, runOut (YYYY-MM-DD), website? (honeypot) }

import { Resend } from 'resend';
import { insertGasAlert } from './admin/_lib/db.js';
import { renderEmail } from './admin/_lib/email.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'FahmanEnergy <contact@fahmanenergy.com>';
const REMIND_LEAD_DAYS = 3;

function ok(res, p) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(200).json({ ok: true, ...p }); }
function fail(res, s, e) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); return res.status(s).json({ ok: false, error: e }); }

function isValidEmail(e) { return typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254; }
function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

function parseDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return null;
  const d = new Date(s + 'T12:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}
function fmtDate(d) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return fail(res, 405, 'Method not allowed'); }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); } }
  if (!body || typeof body !== 'object') return fail(res, 400, 'Missing body');

  // Honeypot
  if (body.website && String(body.website).trim() !== '') return ok(res, { dropped: true });

  const email = String(body.email || '').trim();
  const name = body.name ? String(body.name).trim().slice(0, 120) : null;
  if (!isValidEmail(email)) return fail(res, 400, 'A valid email is required');

  const runOut = parseDate(body.runOut);
  if (!runOut) return fail(res, 400, 'A valid run-out date is required');

  // Clamp numeric fields
  const cylinderKg = Number.isFinite(+body.cylinderKg) ? +body.cylinderKg : null;
  const dailyKg = Number.isFinite(+body.dailyKg) ? Math.round(+body.dailyKg * 1000) / 1000 : null;
  const daysLeft = Number.isFinite(+body.daysLeft) ? Math.round(+body.daysLeft) : null;

  // remind_on = runOut - lead days (but never in the past)
  const remind = new Date(runOut);
  remind.setUTCDate(remind.getUTCDate() - REMIND_LEAD_DAYS);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const remindOn = remind < today ? today : remind;

  const iso = (d) => d.toISOString().slice(0, 10);
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || null;

  // Store (fail-soft: still send confirmation if DB is down)
  let stored = null;
  try {
    stored = await insertGasAlert({
      name, email, cylinderKg, dailyKg, daysLeft,
      runOut: iso(runOut), remindOn: iso(remindOn), ip,
    });
  } catch (err) {
    console.error('[gas-alert] db insert failed', err);
  }

  // Confirmation email
  const greeting = name ? escapeHtml(name.split(/\s+/)[0]) : 'there';
  const infoRows = [];
  if (cylinderKg) infoRows.push(['Your cylinder', `${cylinderKg} kg`]);
  if (dailyKg) infoRows.push(['Estimated daily use', `${dailyKg} kg/day`]);
  if (daysLeft != null) infoRows.push(['Estimated to last', `${daysLeft} days`]);
  infoRows.push(['Reminder date', fmtDate(remindOn)]);
  infoRows.push(['Gas runs out', fmtDate(runOut)]);

  const html = renderEmail({
    preheader: `We'll remind you around ${fmtDate(remindOn)} — before your gas runs out.`,
    eyebrow: 'Reminder set',
    heading: `You're all set, ${greeting} 👍`,
    intro: [
      `We'll send you a reminder around <strong style="color:${'#0F4C3A'}">${fmtDate(remindOn)}</strong> — about ${REMIND_LEAD_DAYS} days before your cooking gas is due to run out — so you can refill on your schedule, not in the middle of dinner.`,
    ],
    infoRows,
    showRefill: true,
  });

  const text = `You're all set, ${name || 'there'}.

We'll email you a reminder around ${fmtDate(remindOn)} — about ${REMIND_LEAD_DAYS} days before your gas is due to run out on ${fmtDate(runOut)}.

${cylinderKg ? `Cylinder: ${cylinderKg} kg\n` : ''}${dailyKg ? `Daily use: ${dailyKg} kg/day\n` : ''}${daysLeft != null ? `Estimated to last: ${daysLeft} days\n` : ''}
To refill your gas:
- Find the nearest refill station near you: https://www.google.com/maps/search/cooking+gas+refill+near+me
- FahmanEnergy distributors near you — coming soon. Tell us where you are: https://www.fahmanenergy.com/contact

Need help? Call +234 706 086 8580.
— FahmanEnergy, Kwara State, Nigeria`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL, to: [email], replyTo: 'Fahmanltd@gmail.com',
      subject: 'Your gas refill reminder is set — FahmanEnergy', html, text,
    });
    if (error) {
      console.error('[gas-alert] resend error', error);
      // Reminder is still stored; tell client it worked.
      return ok(res, { id: stored?.id ?? null, emailDelayed: true, remindOn: iso(remindOn) });
    }
  } catch (err) {
    console.error('[gas-alert] resend exception', err);
    return ok(res, { id: stored?.id ?? null, emailDelayed: true, remindOn: iso(remindOn) });
  }

  return ok(res, { id: stored?.id ?? null, remindOn: iso(remindOn) });
}
