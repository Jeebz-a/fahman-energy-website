// GET /api/cron/gas-reminders
// Invoked daily by Vercel Cron. Finds active gas-refill reminders that are due
// (remind_on <= today) and emails each user that their gas is about to run out,
// then marks the alert as reminded.
//
// Protected by CRON_SECRET: Vercel cron automatically sends
// `Authorization: Bearer ${CRON_SECRET}` when the env var is set.

import { Resend } from 'resend';
import { dueGasAlerts, markGasAlertReminded, gasPriceAgeDays } from '../admin/_lib/db.js';
import { renderEmail } from '../admin/_lib/email.js';

const PRICE_STALE_DAYS = 7;
const ADMIN_EMAIL = 'Fahmanltd@gmail.com';

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
    const html = renderEmail({
      preheader: `Your ${a.cylinder_kg ? a.cylinder_kg + 'kg ' : ''}cylinder is due to run out around ${runOutPretty}. Time to refill.`,
      eyebrow: 'Running low',
      heading: `Your gas is running low, ${greeting} ⛽`,
      intro: [
        `Based on the usage you shared, your ${a.cylinder_kg ? escapeHtml(String(a.cylinder_kg)) + 'kg ' : ''}cylinder is due to run out around <strong style="color:#0F4C3A">${runOutPretty}</strong>.`,
        `Refill in the next day or two so you're never caught in the middle of cooking.`,
      ],
      showRefill: true,
    });
    const text = `Your gas is running low, ${a.name || 'there'}.

Based on your usage, your ${a.cylinder_kg ? a.cylinder_kg + 'kg ' : ''}cylinder is due to run out around ${runOutPretty}.

Refill in the next day or two so you're not caught mid-cooking.

To refill your gas:
- Find the nearest refill station near you: https://www.google.com/maps/search/cooking+gas+refill+near+me
- FahmanEnergy distributors near you — coming soon. Tell us where you are: https://www.fahmanenergy.com/contact

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

  // Price-freshness nudge: since there's no live national price feed, prices are
  // admin-managed. If the displayed prices haven't been touched in a week, remind
  // the team to refresh them so the homepage stays accurate. Sent at most once a week.
  let priceNudge = false;
  try {
    const age = await gasPriceAgeDays();
    if (age != null && age >= PRICE_STALE_DAYS && new Date().getUTCDay() === 1) { // Mondays only
      const html = renderEmail({
        preheader: `Your homepage gas prices are ${age} days old — a quick update keeps them accurate.`,
        eyebrow: 'Price check',
        heading: 'Time to refresh your gas prices',
        intro: [
          `Your published cooking-gas prices were last updated <strong style="color:#0F4C3A">${age} days ago</strong>. They show live on your homepage and feed the gas calculator, so keeping them current builds trust with customers.`,
          `It takes under a minute: open the admin, go to <strong>Gas prices</strong>, adjust the amounts, and save.`,
        ],
        cta: { label: 'Update prices now', url: 'https://www.fahmanenergy.com/admin' },
        showRefill: false,
      });
      const { error } = await resend.emails.send({
        from: FROM_EMAIL, to: [ADMIN_EMAIL], replyTo: ADMIN_EMAIL,
        subject: `Your gas prices are ${age} days old — quick refresh?`,
        html,
        text: `Your published gas prices were last updated ${age} days ago. They show on your homepage and feed the calculator. Update them in under a minute: https://www.fahmanenergy.com/admin (Gas prices tab).`,
      });
      if (!error) priceNudge = true;
    }
  } catch (err) {
    console.error('[cron/gas-reminders] price nudge failed', err);
  }

  return res.status(200).json({ ok: true, due: due.length, sent, failed, priceNudge });
}
