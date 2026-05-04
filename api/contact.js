// Vercel serverless function — handles POST /api/contact
// Reads form submission from contact.html, validates, sends via Resend.
// Env var required: RESEND_API_KEY (set in Vercel project settings).

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// ---- config ---------------------------------------------------------------
const TO_EMAIL = 'Fahmanltd@gmail.com';
const FROM_EMAIL = 'FahmanEnergy Website <contact@fahmanenergy.com>';
const MAX_NAME = 200;
const MAX_ORG = 200;
const MAX_PHONE = 40;
const MAX_ROLE = 80;
const MAX_MSG = 5000;
// --------------------------------------------------------------------------

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  // Practical, not RFC-perfect.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function ok(res, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, ...payload });
}

function fail(res, status, error) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json({ ok: false, error });
}

export default async function handler(req, res) {
  // Method gate
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return fail(res, 405, 'Method not allowed');
  }

  // Body parse — Vercel auto-parses JSON; fall back if not.
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return fail(res, 400, 'Missing body');

  const {
    name = '',
    org = '',
    email = '',
    phone = '',
    role = '',
    message = '',
    website = '', // honeypot — must stay empty
  } = body;

  // Honeypot — if a bot filled the hidden field, fake-success and drop.
  if (website && String(website).trim() !== '') {
    return ok(res, { dropped: true });
  }

  // Validate required
  if (!String(name).trim() || !String(email).trim() || !String(role).trim() || !String(message).trim()) {
    return fail(res, 400, 'Missing required fields');
  }

  // Length sanity
  if (
    String(name).length > MAX_NAME ||
    String(org).length > MAX_ORG ||
    String(phone).length > MAX_PHONE ||
    String(role).length > MAX_ROLE ||
    String(message).length > MAX_MSG
  ) {
    return fail(res, 400, 'Field too long');
  }

  if (!isValidEmail(email)) return fail(res, 400, 'Invalid email');

  // Build email
  const subject = `[Website] ${String(role).slice(0, 60)} — ${String(name).slice(0, 60)}`;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;color:#0A1F18;max-width:600px;">
      <div style="background:#0F4C3A;color:#fff;padding:18px 22px;border-radius:10px 10px 0 0;">
        <div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;opacity:.8;">FahmanEnergy · Website enquiry</div>
        <div style="font-size:18px;font-weight:600;margin-top:4px;">New message from ${escapeHtml(name)}</div>
      </div>
      <div style="background:#FAF8F2;padding:22px;border:1px solid #E4ECE6;border-top:0;border-radius:0 0 10px 10px;">
        <table cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.6;">
          <tr><td style="padding:6px 0;color:#5A6B62;width:140px;">Name</td><td style="padding:6px 0;">${escapeHtml(name)}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6B62;">Organisation</td><td style="padding:6px 0;">${escapeHtml(org || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6B62;">Email</td><td style="padding:6px 0;"><a href="mailto:${escapeHtml(email)}" style="color:#14624A;">${escapeHtml(email)}</a></td></tr>
          <tr><td style="padding:6px 0;color:#5A6B62;">Phone</td><td style="padding:6px 0;">${escapeHtml(phone || '—')}</td></tr>
          <tr><td style="padding:6px 0;color:#5A6B62;">Reaching out as</td><td style="padding:6px 0;"><strong>${escapeHtml(role)}</strong></td></tr>
        </table>
        <hr style="border:0;border-top:1px solid #E4ECE6;margin:18px 0;" />
        <div style="color:#5A6B62;font-size:12px;letter-spacing:.06em;text-transform:uppercase;margin-bottom:8px;">Message</div>
        <div style="white-space:pre-wrap;font-size:14px;line-height:1.7;">${escapeHtml(message)}</div>
        <hr style="border:0;border-top:1px solid #E4ECE6;margin:18px 0;" />
        <div style="font-size:12px;color:#98A39C;">Reply directly to this email to respond to ${escapeHtml(name)}.</div>
      </div>
    </div>
  `;

  const text = [
    `New website enquiry — ${name}`,
    ``,
    `Name: ${name}`,
    `Organisation: ${org || '—'}`,
    `Email: ${email}`,
    `Phone: ${phone || '—'}`,
    `Reaching out as: ${role}`,
    ``,
    `Message:`,
    message,
    ``,
    `— Reply directly to this email to respond.`,
  ].join('\n');

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      replyTo: String(email),
      subject,
      html,
      text,
    });

    if (error) {
      console.error('[contact] resend error', error);
      return fail(res, 502, 'Email service rejected the message');
    }

    return ok(res, { id: data?.id });
  } catch (err) {
    console.error('[contact] handler exception', err);
    return fail(res, 500, 'Internal error');
  }
}
