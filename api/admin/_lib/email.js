// Shared branded email builder for FahmanEnergy transactional mail.
// Table-based + inline styles for broad email-client compatibility
// (Gmail, Outlook, Apple Mail, Yahoo). Web-safe font stacks only.

const C = {
  ink: '#0A1F18',
  body: '#3F4F48',
  muted: '#7C8A83',
  mint900: '#0B3D2E',
  mint800: '#0F4C3A',
  mint700: '#14624A',
  mint300: '#A8E0BD',
  mint100: '#E2F1E8',
  cream: '#FAF8F2',
  gold: '#D9A55B',
  goldDark: '#9A6B1E',
  line: '#E4ECE6',
  page: '#EDF2EE',
};

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Bulletproof, pill-shaped button.
function button({ label, url, bg = C.mint800, color = '#ffffff' }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto">
    <tr><td align="center" bgcolor="${bg}" style="border-radius:999px">
      <a href="${url}" target="_blank" style="display:inline-block;padding:15px 30px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;line-height:1;color:${color};text-decoration:none;border-radius:999px">${label}</a>
    </td></tr></table>`;
}

// The "To refill your gas" block — shared across emails.
function refillBlock() {
  const mapsUrl = 'https://www.google.com/maps/search/cooking+gas+refill+near+me';
  return `
  <tr><td style="padding:4px 32px 8px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.cream};border:1px solid ${C.line};border-radius:16px">
      <tr><td style="padding:22px 24px 18px">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.mint700};font-weight:bold">To refill your gas</div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:14px">
          <tr>
            <td width="38" valign="top" style="padding-top:2px">
              <div style="width:34px;height:34px;border-radius:50%;background:${C.mint100};text-align:center;line-height:34px;font-size:17px">📍</div>
            </td>
            <td valign="top" style="font-family:Arial,Helvetica,sans-serif;padding-left:10px">
              <div style="font-size:15px;font-weight:bold;color:${C.ink}">Find the nearest refill station</div>
              <div style="font-size:13px;color:${C.body};line-height:1.5;margin:3px 0 10px">Search for a cooking-gas refill point closest to you, right now.</div>
              ${button({ label: 'Search refill stations near me', url: mapsUrl, bg: C.mint800 })}
            </td>
          </tr>
        </table>

        <div style="border-top:1px solid ${C.line};margin:18px 0"></div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="38" valign="top" style="padding-top:2px">
              <div style="width:34px;height:34px;border-radius:50%;background:#F6ECD9;text-align:center;line-height:34px;font-size:17px">🚚</div>
            </td>
            <td valign="top" style="font-family:Arial,Helvetica,sans-serif;padding-left:10px">
              <div style="font-size:15px;font-weight:bold;color:${C.ink}">
                FahmanEnergy distributors near you
                <span style="display:inline-block;margin-left:6px;font-size:10px;font-weight:bold;letter-spacing:.5px;text-transform:uppercase;color:${C.goldDark};background:#F6ECD9;border-radius:999px;padding:2px 8px;vertical-align:middle">Coming soon</span>
              </div>
              <div style="font-size:13px;color:${C.body};line-height:1.5;margin-top:3px">We're building a network of local FahmanEnergy refill points so a clean refill is always within reach. <a href="https://www.fahmanenergy.com/contact" target="_blank" style="color:${C.mint700};font-weight:bold">Tell us where you are</a> and we'll prioritise your area.</div>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * Build a complete branded email.
 * @param {object} o
 * @param {string} o.preheader  - hidden inbox-preview text
 * @param {string} o.eyebrow    - small uppercase label in the header
 * @param {string} o.heading    - main heading (already escaped or plain text)
 * @param {string[]} o.intro    - array of paragraph HTML strings
 * @param {Array<[string,string]>} [o.infoRows] - label/value rows for an info card
 * @param {{label:string,url:string,gold?:boolean}} [o.cta] - primary CTA above the refill block
 * @param {boolean} [o.showRefill=true]
 * @returns {string} full HTML document
 */
export function renderEmail(o) {
  const {
    preheader = '', eyebrow = '', heading = '', intro = [],
    infoRows = null, cta = null, showRefill = true,
  } = o;

  const introHtml = intro.map(
    (p) => `<p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:${C.body}">${p}</p>`
  ).join('');

  const infoHtml = infoRows && infoRows.length ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.mint100};border-radius:14px;margin:6px 0 20px">
      <tr><td style="padding:16px 20px">
        ${infoRows.map(([k, v], i) => `
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${C.mint700};padding:${i ? '7px' : '0'} 0 7px">${escapeHtml(k)}</td>
            <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${C.mint900};padding:${i ? '7px' : '0'} 0 7px">${escapeHtml(v)}</td>
          </tr>
        </table>`).join('')}
      </td></tr>
    </table>` : '';

  const ctaHtml = cta ? `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px">
      <tr><td align="center">${button({ label: cta.label, url: cta.url, bg: cta.gold ? C.gold : C.mint800, color: cta.gold ? C.ink : '#ffffff' })}</td></tr>
    </table>` : '';

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>FahmanEnergy</title>
</head>
<body style="margin:0;padding:0;background:${C.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:${C.page}">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page}">
  <tr><td align="center" style="padding:28px 14px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px">

      <!-- Header -->
      <tr><td style="background:${C.mint800};background:linear-gradient(135deg,${C.mint700},${C.mint900});border-radius:20px 20px 0 0;padding:26px 32px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td style="font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:bold;color:#ffffff;letter-spacing:-.3px">Fahman<span style="color:${C.mint300};font-style:italic">Energy</span></td>
          <td align="right" style="font-family:Arial,Helvetica,sans-serif;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.mint300}">${escapeHtml(eyebrow)}</td>
        </tr></table>
      </td></tr>

      <!-- Body -->
      <tr><td style="background:#ffffff;padding:30px 32px 8px">
        <h1 style="margin:0 0 14px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.2;font-weight:bold;color:${C.ink}">${heading}</h1>
        ${introHtml}
        ${infoHtml}
        ${ctaHtml}
      </td></tr>

      ${showRefill ? '' : '<tr><td style="background:#ffffff;height:8px"></td></tr>'}
      ${showRefill ? '<tr><td style="background:#ffffff;height:10px"></td></tr>' + refillBlock() + '<tr><td style="background:#ffffff;height:14px;border-radius:0"></td></tr>' : ''}

      <!-- Footer -->
      <tr><td style="background:${C.mint900};border-radius:0 0 20px 20px;padding:24px 32px">
        <div style="font-family:Georgia,serif;font-size:16px;font-weight:bold;color:#ffffff">Fahman<span style="color:${C.mint300};font-style:italic">Energy</span></div>
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:rgba(255,255,255,.6);margin-top:8px">
          Solar-powered LPG for rural Nigeria · NMDPRA Licensed<br/>
          Ilesha Baruba &amp; Ilorin, Kwara State, Nigeria<br/>
          <a href="tel:+2347060868580" style="color:${C.mint300};text-decoration:none">+234 706 086 8580</a> ·
          <a href="https://www.fahmanenergy.com" target="_blank" style="color:${C.mint300};text-decoration:none">fahmanenergy.com</a>
        </div>
      </td></tr>

      <tr><td style="padding:16px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.muted};text-align:center">
        You received this because you asked FahmanEnergy to remind you about your gas. ·
        <a href="https://www.fahmanenergy.com/gas-calculator" target="_blank" style="color:${C.muted}">Recalculate</a>
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
