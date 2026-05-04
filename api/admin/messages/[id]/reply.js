// POST /api/admin/messages/[id]/reply
// Body: { body }
//
// Sends an email reply to the original sender via Resend, records the reply
// row, and flips the message's status to 'replied'.

import { Resend } from 'resend';
import { verifySession } from '../../_lib/auth.js';
import { getMessage, insertReply } from '../../_lib/db.js';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = 'FahmanEnergy <contact@fahmanenergy.com>';
const MAX_REPLY = 10000;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const session = verifySession(req);
  if (!session) return res.status(401).json({ ok: false, error: 'Unauthorized' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const id = Number(req.query?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ ok: false, error: 'Invalid message id' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }
  }
  const replyBody = String(body?.body || '').trim();
  if (!replyBody) return res.status(400).json({ ok: false, error: 'Reply body is required' });
  if (replyBody.length > MAX_REPLY) return res.status(400).json({ ok: false, error: 'Reply is too long' });

  let data;
  try {
    data = await getMessage(id);
  } catch (err) {
    console.error('[admin/messages/:id/reply] db get failed', err);
    return res.status(500).json({ ok: false, error: 'Database error' });
  }
  if (!data) return res.status(404).json({ ok: false, error: 'Message not found' });
  const original = data.message;

  // Build the email
  const subject = `Re: your message to FahmanEnergy`;
  const greetingName = original.name?.split(/\s+/)[0] || 'there';

  const text = `Hi ${greetingName},

${replyBody}

—
FahmanEnergy
+234 706 086 8580 · contact@fahmanenergy.com
Pipeline Area, Ilorin, Kwara State, Nigeria

---
Your original message (${new Date(original.created_at).toUTCString()}):
${original.message}
`;

  const html = `<div style="font-family:Inter,Arial,sans-serif;color:#0A1F18;max-width:600px;line-height:1.6;">
  <p>Hi ${escapeHtml(greetingName)},</p>
  <div style="white-space:pre-wrap;">${escapeHtml(replyBody)}</div>
  <hr style="border:0;border-top:1px solid #E4ECE6;margin:28px 0;" />
  <p style="font-size:13px;color:#5A6B62;line-height:1.55;">
    <strong style="color:#0F4C3A;">FahmanEnergy</strong><br/>
    +234 706 086 8580 · <a href="mailto:contact@fahmanenergy.com" style="color:#14624A;">contact@fahmanenergy.com</a><br/>
    Pipeline Area, Ilorin, Kwara State, Nigeria
  </p>
  <details style="margin-top:24px;font-size:12px;color:#98A39C;">
    <summary style="cursor:pointer;">Your original message</summary>
    <div style="margin-top:8px;padding:12px;background:#FAF8F2;border-radius:8px;white-space:pre-wrap;">${escapeHtml(original.message)}</div>
  </details>
</div>`;

  let resendId = null;
  try {
    const send = await resend.emails.send({
      from: FROM_EMAIL,
      to: [original.email],
      replyTo: 'Fahmanltd@gmail.com',
      subject,
      html,
      text,
    });
    if (send?.error) {
      console.error('[admin/messages/:id/reply] resend error', send.error);
      return res.status(502).json({ ok: false, error: 'Email service rejected the reply', detail: send.error?.message });
    }
    resendId = send?.data?.id || null;
  } catch (err) {
    console.error('[admin/messages/:id/reply] resend exception', err);
    return res.status(502).json({ ok: false, error: 'Email send failed', detail: err.message });
  }

  let reply;
  try {
    reply = await insertReply({
      messageId: id,
      body: replyBody,
      sentBy: session.username,
      resendId,
    });
  } catch (err) {
    console.error('[admin/messages/:id/reply] db insert failed', err);
    // Email already went out — return success but warn.
    return res.status(200).json({ ok: true, sent: true, dbWriteFailed: true, resendId });
  }

  return res.status(200).json({ ok: true, reply });
}
