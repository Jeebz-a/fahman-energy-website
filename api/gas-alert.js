// POST /api/gas-alert
// Captures a refill-reminder signup from the gas calculator, stores it,
// and sends an immediate confirmation email via Resend.
//
// Body: { name?, email, cylinderKg?, dailyKg?, daysLeft?, runOut (YYYY-MM-DD), website? (honeypot) }

import { Resend } from 'resend';
import { insertGasAlert } from './admin/_lib/db.js';

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
  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0A1F18;max-width:560px;line-height:1.6">
    <div style="background:#0F4C3A;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
      <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#A8E0BD">FahmanEnergy · Refill reminder set</div>
      <div style="font-family:Georgia,serif;font-size:20px;margin-top:6px">You're all set, ${greeting} 👍</div>
    </div>
    <div style="background:#FAF8F2;padding:24px;border:1px solid #E4ECE6;border-top:0;border-radius:0 0 12px 12px">
      <p style="margin:0 0 14px">We'll email you a reminder around <strong>${fmtDate(remindOn)}</strong> — about ${REMIND_LEAD_DAYS} days before your gas is due to run out on <strong>${fmtDate(runOut)}</strong>.</p>
      ${cylinderKg ? `<table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:5px 0;color:#5A6B62">Cylinder</td><td style="padding:5px 0;text-align:right"><strong>${escapeHtml(String(cylinderKg))} kg</strong></td></tr>
        ${dailyKg ? `<tr><td style="padding:5px 0;color:#5A6B62">Estimated daily use</td><td style="padding:5px 0;text-align:right"><strong>${escapeHtml(String(dailyKg))} kg/day</strong></td></tr>` : ''}
        ${daysLeft != null ? `<tr><td style="padding:5px 0;color:#5A6B62">Estimated to last</td><td style="padding:5px 0;text-align:right"><strong>${daysLeft} days</strong></td></tr>` : ''}
      </table>` : ''}
      <p style="margin:16px 0 0;font-size:13px;color:#5A6B62">Need a refill or want to switch to clean cooking gas? Reply to this email or call <a href="tel:+2347060868580" style="color:#14624A">+234 706 086 8580</a>.</p>
      <p style="margin:14px 0 0;font-size:12px;color:#98A39C">FahmanEnergy · Ilesha Baruba & Ilorin, Kwara State, Nigeria</p>
    </div>
  </div>`;
  const text = `You're all set, ${name || 'there'}.

We'll email you a reminder around ${fmtDate(remindOn)} — about ${REMIND_LEAD_DAYS} days before your gas is due to run out on ${fmtDate(runOut)}.

${cylinderKg ? `Cylinder: ${cylinderKg} kg\n` : ''}${dailyKg ? `Daily use: ${dailyKg} kg/day\n` : ''}${daysLeft != null ? `Estimated to last: ${daysLeft} days\n` : ''}
Need a refill? Call +234 706 086 8580.
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
