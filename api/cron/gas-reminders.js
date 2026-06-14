// GET /api/cron/gas-reminders
// Invoked daily by Vercel Cron. Finds active gas-refill reminders that are due
// (remind_on <= today) and emails each user that their gas is about to run out,
// then marks the alert as reminded.
//
// Protected by CRON_SECRET: Vercel cron automatically sends
// `Authorization: Bearer ${CRON_SECRET}` when the env var is set.

import { Resend } from 'resend';
import { dueGasAlerts, markGasAlertReminded } from '../admin/_lib/db.js';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = 'FahmanEnergy <contact@fahmanenergy.com>';

function escapeHtml(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function fmtDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d + 'T12:00:00Z');
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  // Auth: require the cron secret (header or ?key=).
  const secret = process.env.CRON_SECRET || '';
  if (secret) {
    const auth = req.headers['authorization'] || '';
    const key = (req.query && req.query.key) || '';
    if (auth !== `Bearer ${secret}` && key !== secret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }

  let due;
  try {
    due = await dueGasAlerts();
  } catch (err) {
    console.error('[cron/gas-reminders] db error', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }

  let sent = 0, failed = 0;
  for (const a of due) {
    const greeting = a.name ? escapeHtml(String(a.name).split(/\s+/)[0]) : 'there';
    const runOutPretty = fmtDate(a.run_out);
    const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0A1F18;max-width:560px;line-height:1.6">
      <div style="background:#0F4C3A;color:#fff;padding:22px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#A8E0BD">FahmanEnergy · Refill reminder</div>
        <div style="font-family:Georgia,serif;font-size:20px;margin-top:6px">Your gas is running low, ${greeting} ⛽</div>
      </div>
      <div style="background:#FAF8F2;padding:24px;border:1px solid #E4ECE6;border-top:0;border-radius:0 0 12px 12px">
        <p style="margin:0 0 14px">Based on the usage you told us, your ${a.cylinder_kg ? escapeHtml(String(a.cylinder_kg)) + 'kg ' : ''}cylinder is due to run out around <strong>${runOutPretty}</strong>.</p>
        <p style="margin:0 0 18px">Refill now so you're not caught in the middle of cooking.</p>
        <a href="https://www.fahmanenergy.com/contact" style="display:inline-block;background:#0F4C3A;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600;font-size:14px">Arrange a refill</a>
        <p style="margin:18px 0 0;font-size:13px;color:#5A6B62">Or call us directly: <a href="tel:+2347060868580" style="color:#14624A">+234 706 086 8580</a></p>
        <p style="margin:14px 0 0;font-size:12px;color:#98A39C">You asked FahmanEnergy to remind you. <a href="https://www.fahmanenergy.com/gas-calculator" style="color:#14624A">Recalculate</a> any time. · Kwara State, Nigeria</p>
      </div>
    </div>`;
    const text = `Your gas is running low, ${a.name || 'there'}.

Based on your usage, your ${a.cylinder_kg ? a.cylinder_kg + 'kg ' : ''}cylinder is due to run out around ${runOutPretty}.

Refill now so you're not caught mid-cooking.
Arrange a refill: https://www.fahmanenergy.com/contact
Or call +234 706 086 8580.

— FahmanEnergy, Kwara State, Nigeria`;

    try {
      const { error } = await resend.emails.send({
        from: FROM_EMAIL, to: [a.email], replyTo: 'Fahmanltd@gmail.com',
        subject: 'Your cooking gas is running low — time to refill', html, text,
      });
      if (error) { failed++; console.error('[cron/gas-reminders] send error', a.id, error); continue; }
      await markGasAlertReminded(a.id);
      sent++;
    } catch (err) {
      failed++;
      console.error('[cron/gas-reminders] exception', a.id, err);
    }
  }

  return res.status(200).json({ ok: true, due: due.length, sent, failed });
}
