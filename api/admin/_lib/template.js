// Generates the full HTML page for a published blog post.
// Mirrors the markup of existing posts in /blog so design stays consistent.

const SITE_ORIGIN = 'https://www.fahmanenergy.com';

const CATEGORY_LABELS = {
  lpg:       'LPG',
  solar:     'Solar',
  vision:    'Vision 2030',
  approach:  'Our approach',
  investors: 'Investors',
};

const CATEGORY_SECTIONS = {
  lpg:       'LPG',
  solar:     'Solar',
  vision:    'Vision 2030',
  approach:  'Our approach',
  investors: 'Investors',
};

export function categoryLabel(cat)  { return CATEGORY_LABELS[cat]   || 'Article'; }
export function categorySection(cat){ return CATEGORY_SECTIONS[cat] || 'Article'; }

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(s) { return escapeHtml(s); }

export function escapeJson(s) {
  // Values placed inside JSON-LD strings. JSON.stringify handles backslashes,
  // quotes, and control chars; strip the wrapping quotes and escape </ so a
  // stray </script> in the input can't break out of the surrounding script tag.
  return JSON.stringify(String(s ?? '')).slice(1, -1).replace(/<\//g, '<\\/');
}

/** Estimate reading time in minutes from rendered HTML. */
export function readMinutes(html) {
  const text = String(html).replace(/<[^>]+>/g, ' ');
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

/** Format an ISO date to "Month D, YYYY" English (e.g. "May 4, 2026"). */
export function prettyDate(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });
}

/** Build ISO timestamp at 09:00 +01:00 (Lagos time) for the article publish meta. */
export function isoTimestampLagos(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T09:00:00+01:00`;
}

/**
 * Build a complete blog post HTML page.
 *
 * @param {object} p
 * @param {string} p.title
 * @param {string} p.slug
 * @param {string} p.category - one of: lpg|solar|vision|approach|investors
 * @param {string} p.excerpt
 * @param {string} p.bodyHtml - already-rendered HTML for the post body
 * @param {string|null} p.heroPath - "/blog/img/{slug}/hero.{ext}" or null
 * @param {string|null} p.heroAlt
 * @param {Date} p.publishedAt
 * @returns {string} full HTML document
 */
export function renderPostPage(p) {
  const {
    title, slug, category, excerpt, bodyHtml,
    heroPath, heroAlt, heroSvgInline, publishedAt,
  } = p;

  const url = `${SITE_ORIGIN}/blog/${slug}`;
  const datePretty = prettyDate(publishedAt);
  const dateIso = isoTimestampLagos(publishedAt);
  const dateShort = dateIso.slice(0, 10);
  const minutes = readMinutes(bodyHtml);
  const section = categorySection(category);
  const tagLabel = categoryLabel(category);
  const ogImage = heroPath ? `${SITE_ORIGIN}${heroPath}` : `${SITE_ORIGIN}/og-image.jpg`;

  let heroBlock;
  if (heroSvgInline) {
    heroBlock = `<div class="cover">${heroSvgInline}</div>`;
  } else if (heroPath) {
    heroBlock = `<div class="cover"><img src="${escapeAttr(heroPath)}" alt="${escapeAttr(heroAlt || title)}" loading="eager" /></div>`;
  } else {
    heroBlock = `<div class="cover"><svg viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${escapeAttr(title)}">
  <defs><linearGradient id="bg-${slug}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14624A"/><stop offset="1" stop-color="#0B3D2E"/></linearGradient></defs>
  <rect width="1200" height="675" fill="url(#bg-${slug})"/>
  <text x="600" y="360" text-anchor="middle" font-family="Fraunces,serif" font-size="56" fill="#A8E0BD" font-style="italic" opacity=".9">FahmanEnergy</text>
</svg></div>`;
  }

  return `<!DOCTYPE html>
<html lang="en-NG">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)} — FahmanEnergy</title>
<meta name="description" content="${escapeAttr(excerpt)}" />
<meta name="author" content="The FahmanEnergy team" />
<meta property="article:published_time" content="${dateIso}" />
<meta property="article:modified_time" content="${dateIso}" />
<meta property="article:section" content="${escapeAttr(section)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<meta name="theme-color" content="#0F4C3A" />
<link rel="canonical" href="${url}" />
<link rel="alternate" hreflang="en-NG" href="${url}" />
<link rel="alternate" hreflang="x-default" href="${url}" />
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
<link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
<link rel="manifest" href="/site.webmanifest" />

<meta property="og:type" content="article" />
<meta property="og:site_name" content="FahmanEnergy" />
<meta property="og:locale" content="en_NG" />
<meta property="og:url" content="${url}" />
<meta property="og:title" content="${escapeAttr(title)}" />
<meta property="og:description" content="${escapeAttr(excerpt)}" />
<meta property="og:image" content="${ogImage}" />
<meta property="og:image:alt" content="${escapeAttr(heroAlt || title)}" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@FahmanEnergy" />
<meta name="twitter:title" content="${escapeAttr(title)}" />
<meta name="twitter:description" content="${escapeAttr(excerpt)}" />
<meta name="twitter:image" content="${ogImage}" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,300..900;1,300..900&family=Inter:wght@300;400;500;600;700;800&display=swap" />

<script type="application/ld+json">{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "${escapeJson(title)}",
  "image": ["${ogImage}"],
  "datePublished": "${dateIso}",
  "dateModified": "${dateIso}",
  "author": {"@type": "Organization", "name": "FahmanEnergy", "url": "${SITE_ORIGIN}/"},
  "publisher": {"@type": "Organization", "name": "FahmanEnergy", "logo": {"@type": "ImageObject", "url": "${SITE_ORIGIN}/apple-touch-icon.svg"}},
  "mainEntityOfPage": {"@type": "WebPage", "@id": "${url}"},
  "description": "${escapeJson(excerpt)}",
  "articleSection": "${escapeJson(section)}",
  "inLanguage": "en-NG",
  "isPartOf": {"@type": "Blog", "@id": "${SITE_ORIGIN}/blog#blog"}
}</script>

<style>
:root{--mint-100:#E2F4E9;--mint-300:#A8E0BD;--mint-500:#6FCF97;--mint-700:#14624A;--mint-800:#0F4C3A;--mint-900:#0B3D2E;--gold:#D9A55B;--cream:#FAF8F2;--ink-900:#0A1F18;--ink-700:#3F5A4F;--ink-500:#6F8278;--ink-300:#A8B5AE;--line:#E6ECE8;--r-md:14px;--r-lg:20px;--r-xl:28px;--shadow-md:0 8px 24px rgba(11,61,46,.08);--t:.35s cubic-bezier(.2,.8,.2,1)}
*{box-sizing:border-box;margin:0;padding:0}html{scroll-behavior:smooth}
body{font-family:'Inter',sans-serif;color:var(--ink-900);background:var(--cream);line-height:1.7;-webkit-font-smoothing:antialiased}
.container{max-width:1240px;margin:0 auto;padding:0 32px}
a{color:inherit;text-decoration:none}img,svg{max-width:100%;display:block}
.logo{display:inline-flex;align-items:center;gap:10px;color:var(--ink-900)}
.logo-mark{width:42px;height:42px;flex:none}
.logo-text{display:inline-flex;align-items:baseline;letter-spacing:-.02em}
.logo-fahman{font-family:'Fraunces',serif;font-weight:500;font-size:1.32rem;color:#0F4C3A;letter-spacing:-.02em}
.logo-energy{font-family:'Fraunces',serif;font-style:italic;font-weight:500;font-size:1.32rem;color:#6FCF97;letter-spacing:-.02em;margin-left:1px}
.footer .logo-fahman{color:#FFFFFF}.footer .logo-energy{color:#A8E0BD}
.header{position:fixed;top:0;left:0;right:0;z-index:100;padding:18px 0;transition:var(--t);background:#FAF8F2;border-bottom:1px solid transparent}
.header.scrolled{border-bottom:1px solid var(--line);box-shadow:0 2px 14px rgba(11,61,46,.07);padding:12px 0}
.header-inner{display:flex;align-items:center;justify-content:space-between}
.nav-links{display:flex;align-items:center;gap:4px}
.nav-links a{padding:10px 18px;border-radius:999px;font-size:.92rem;font-weight:500;color:var(--ink-700);transition:.2s}
.nav-links a:hover{color:var(--mint-800)}.nav-links a.active{background:var(--mint-100);color:var(--mint-800)}
.nav-cta{display:flex;align-items:center;gap:12px}
.btn{display:inline-flex;align-items:center;gap:10px;padding:14px 24px;border-radius:999px;font-size:.95rem;font-weight:500;border:0;cursor:pointer;transition:var(--t);font-family:inherit;white-space:nowrap}
.btn-primary{background:var(--mint-800);color:#fff}.btn-primary:hover{background:var(--mint-700);transform:translateY(-2px);box-shadow:var(--shadow-md)}
.menu-toggle{display:none;width:40px;height:40px;border-radius:999px;border:1px solid var(--line);align-items:center;justify-content:center;background:#fff}
.menu-toggle span,.menu-toggle span::before,.menu-toggle span::after{display:block;width:18px;height:1.5px;background:var(--ink-900)}
.menu-toggle span{position:relative}
.menu-toggle span::before{content:'';position:absolute;left:0;top:-6px}
.menu-toggle span::after{content:'';position:absolute;left:0;top:6px}
@media(max-width:980px){.nav-links{display:none}.menu-toggle{display:flex}.nav-cta .btn-primary{display:none}.nav-links.open{display:flex;flex-direction:column;align-items:stretch;position:fixed;top:70px;left:16px;right:16px;background:#fff;padding:16px;border-radius:var(--r-md);box-shadow:0 20px 50px rgba(11,61,46,.12);gap:4px}}
.article-hero{padding:140px 0 32px}
.crumbs{display:flex;align-items:center;gap:8px;font-size:.82rem;color:var(--ink-500);margin-bottom:24px;flex-wrap:wrap}
.crumbs a:hover{color:var(--mint-800)}.crumbs .sep{color:var(--ink-300)}
.tag-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;background:var(--mint-100);color:var(--mint-800);font-size:.74rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:24px}
.article-title{font-family:'Fraunces',serif;font-weight:500;letter-spacing:-.02em;line-height:1.12;font-size:clamp(2.2rem,5vw,3.6rem);max-width:18ch;margin-bottom:24px;color:var(--ink-900)}
.article-meta{display:flex;align-items:center;gap:16px;font-size:.9rem;color:var(--ink-500);margin-bottom:48px;flex-wrap:wrap}
.article-meta .dot{width:3px;height:3px;border-radius:50%;background:var(--ink-300)}
.article-meta strong{color:var(--ink-900);font-weight:600}
.cover{aspect-ratio:16/9;border-radius:var(--r-xl);overflow:hidden;margin-bottom:64px;background:linear-gradient(160deg,#14624A,#0B3D2E)}
.cover svg,.cover img{width:100%;height:100%;object-fit:cover}
.body-grid{display:grid;grid-template-columns:1fr minmax(0,720px) 1fr;column-gap:48px;padding-bottom:96px}
.body-grid > .body{grid-column:2}
.body p{font-size:1.08rem;color:var(--ink-700);margin:0 0 22px;line-height:1.75}
.body p:first-of-type::first-letter{font-family:'Fraunces',serif;font-size:3.6rem;float:left;line-height:.95;padding:6px 12px 0 0;color:var(--mint-700);font-weight:500}
.body h2{font-family:'Fraunces',serif;font-weight:500;font-size:1.85rem;letter-spacing:-.02em;line-height:1.18;margin:48px 0 18px;color:var(--ink-900)}
.body h3{font-family:'Fraunces',serif;font-weight:500;font-size:1.35rem;line-height:1.25;margin:32px 0 14px;color:var(--ink-900)}
.body ul,.body ol{margin:0 0 22px 24px;color:var(--ink-700)}.body li{margin-bottom:8px;font-size:1.05rem}
.body blockquote{margin:32px 0;padding:24px 28px;border-left:4px solid var(--mint-500);background:#fff;border-radius:0 var(--r-md) var(--r-md) 0;font-family:'Fraunces',serif;font-style:italic;font-size:1.25rem;color:var(--ink-900);line-height:1.45}
.body blockquote cite{display:block;margin-top:12px;font-family:'Inter',sans-serif;font-style:normal;font-size:.85rem;color:var(--ink-500);font-weight:500}
.body strong{color:var(--ink-900);font-weight:600}
.body a{color:var(--mint-800);font-weight:500;border-bottom:1px solid var(--mint-300);transition:.2s}.body a:hover{color:var(--mint-700);border-color:var(--mint-700)}
.body hr{border:0;border-top:1px solid var(--line);margin:48px 0}
.body img{border-radius:var(--r-md);margin:28px 0}
.body code{background:#EEF1EF;padding:2px 8px;border-radius:6px;font-family:'Menlo','SF Mono',Consolas,monospace;font-size:.92em}
.body pre{background:#0A1F18;color:#E2F4E9;padding:18px;border-radius:var(--r-md);overflow:auto;margin:28px 0}
.body pre code{background:transparent;color:inherit;padding:0;font-size:.88em}
@media(max-width:880px){.body-grid{grid-template-columns:1fr;padding:0 16px 64px}.body-grid > .body{grid-column:1}.article-hero{padding:110px 16px 24px}.cover{margin:0 16px 48px}}
.share-row{display:flex;align-items:center;gap:14px;padding:32px 0;border-top:1px solid var(--line);margin-top:48px;font-size:.88rem;color:var(--ink-500)}
.share-row a{color:var(--mint-800);font-weight:500;border-bottom:1px solid var(--mint-300)}
.footer{background:var(--ink-900);color:rgba(255,255,255,.7);padding:80px 0 40px}
.footer-grid{display:grid;grid-template-columns:1.4fr 1fr 1fr 1fr;gap:60px;margin-bottom:60px}
.footer h4{color:#fff;font-family:'Inter',sans-serif;font-size:.85rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;margin-bottom:20px}
.footer ul{list-style:none}.footer li{margin-bottom:10px}
.footer a{color:rgba(255,255,255,.65);font-size:.92rem;transition:.2s}.footer a:hover{color:#fff}
.footer-brand p{margin-top:18px;font-size:.92rem;color:rgba(255,255,255,.55)}
.footer-bottom{padding-top:32px;border-top:1px solid rgba(255,255,255,.08);display:flex;justify-content:space-between;flex-wrap:wrap;gap:20px;font-size:.85rem;color:rgba(255,255,255,.5)}
@media(max-width:880px){.footer-grid{grid-template-columns:1fr 1fr;gap:40px}}
@media(max-width:560px){.footer-grid{grid-template-columns:1fr}}
html, body { overflow-x: hidden; max-width:100%; width:100%; }
@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.01ms !important;transition-duration:.01ms !important}}
.skip-link{position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;background:#0F4C3A;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:.9rem;z-index:9999}
.skip-link:focus{position:fixed;left:16px;top:16px;width:auto;height:auto;outline:2px solid #D9A55B;outline-offset:2px}
</style>
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>

<header class="header">
  <div class="container header-inner">
    <a href="../index.html" class="logo">
      <svg class="logo-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="52" cy="13" r="5" fill="#D9A55B"/>
        <path d="M28 4 Q6 26 6 39 A22 22 0 0 1 50 39 Q50 26 28 4 Z" fill="#0F4C3A"/>
        <path d="M28 14 C21 21 15 28 15 34 C15 41 21 49 28 54 Z" fill="#A8E0BD"/>
        <path d="M28 14 C35 21 41 28 41 34 C41 41 35 49 28 54 Z" fill="#6FCF97"/>
      </svg>
      <span class="logo-text"><span class="logo-fahman">Fahman</span><span class="logo-energy">Energy</span></span>
    </a>
    <nav class="nav-links">
      <a href="../index.html">Home</a>
      <a href="../about.html">About</a>
      <a href="../services.html">Services</a>
      <a href="../solar.html">Solar</a>
      <a href="../investors.html">Investors</a>
      <a href="../blog.html" class="active">Blog</a>
      <a href="../contact.html">Contact</a>
    </nav>
    <div class="nav-cta">
      <a href="../contact.html" class="btn btn-primary">Partner with us</a>
      <button class="menu-toggle" aria-label="Menu"><span></span></button>
    </div>
  </div>
</header>

<main id="main">
<article>
  <div class="article-hero">
    <div class="container">
      <nav class="crumbs" aria-label="Breadcrumb">
        <a href="../index.html">Home</a> <span class="sep">/</span>
        <a href="../blog.html">Blog</a> <span class="sep">/</span>
        <span>${escapeHtml(title)}</span>
      </nav>
      <span class="tag-pill">${escapeHtml(tagLabel)}</span>
      <h1 class="article-title">${escapeHtml(title)}</h1>
      <div class="article-meta">
        <strong>By the FahmanEnergy team</strong>
        <span class="dot"></span>
        <time datetime="${dateShort}">${escapeHtml(datePretty)}</time>
        <span class="dot"></span>
        <span>${minutes} min read</span>
        <span class="dot"></span>
        <span>Kwara State, Nigeria</span>
      </div>
    </div>
  </div>

  ${heroBlock}

  <div class="body-grid">
    <div class="body">
${bodyHtml}

      <div class="share-row">
        <span>Share:</span>
        <a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}" target="_blank" rel="noopener">X</a>
        <a href="https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}" target="_blank" rel="noopener">LinkedIn</a>
        <a href="https://wa.me/?text=${encodeURIComponent(title + ' ' + url)}" target="_blank" rel="noopener">WhatsApp</a>
        <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url)}">Email</a>
      </div>
    </div>
  </div>
</article>
</main>

<footer class="footer">
  <div class="container">
    <div class="footer-grid">
      <div class="footer-brand">
        <a href="../index.html" class="logo">
          <svg class="logo-mark" viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <circle cx="52" cy="13" r="5" fill="#D9A55B"/>
            <path d="M28 4 Q6 26 6 39 A22 22 0 0 1 50 39 Q50 26 28 4 Z" fill="#0F4C3A"/>
            <path d="M28 14 C21 21 15 28 15 34 C15 41 21 49 28 54 Z" fill="#A8E0BD"/>
            <path d="M28 14 C35 21 41 28 41 34 C41 41 35 49 28 54 Z" fill="#6FCF97"/>
          </svg>
          <span class="logo-text"><span class="logo-fahman">Fahman</span><span class="logo-energy">Energy</span></span>
        </a>
        <p>Solar-powered LPG distribution for rural Nigeria. NMDPRA licensed.</p>
      </div>
      <div>
        <h4>Company</h4>
        <ul>
          <li><a href="../about.html">About</a></li>
          <li><a href="../services.html">Services</a></li>
          <li><a href="../solar.html">Solar</a></li>
          <li><a href="../blog.html">Blog</a></li>
        </ul>
      </div>
      <div>
        <h4>Connect</h4>
        <ul>
          <li><a href="../contact.html">Contact</a></li>
          <li><a href="../investors.html">Investors</a></li>
          <li><a href="mailto:Fahmanltd@gmail.com">Email</a></li>
        </ul>
      </div>
      <div>
        <h4>Visit</h4>
        <ul>
          <li>Pipeline Area, Ilorin</li>
          <li>Kwara State, Nigeria</li>
          <li>+234 706 086 8580</li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© ${new Date().getFullYear()} Fahman Oil & Gas Ltd. All rights reserved.</span>
      <span>RC Number on request · NMDPRA Licensed</span>
    </div>
  </div>
</footer>

<script>
  const header = document.querySelector('.header');
  const onScroll = () => { if (window.scrollY > 16) header?.classList.add('scrolled'); else header?.classList.remove('scrolled'); };
  window.addEventListener('scroll', onScroll, { passive:true }); onScroll();
  const toggle = document.querySelector('.menu-toggle'); const links = document.querySelector('.nav-links');
  toggle?.addEventListener('click', () => links?.classList.toggle('open'));
</script>
<script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments);};</script>
<script defer src="/_vercel/insights/script.js"></script>
<script defer src="/_vercel/speed-insights/script.js"></script>
</body>
</html>
`;
}

/**
 * Build the small card snippet that gets injected into blog.html's #postGrid.
 */
export function renderBlogCard({ title, slug, excerpt, category, publishedAt, heroPath, cardSvg, readMinutes: rm }) {
  const dateIso = isoTimestampLagos(publishedAt).slice(0, 10);
  const datePretty = prettyDate(publishedAt);
  const tagLabel = categoryLabel(category);
  // Rough estimate of read-time when nothing was passed in (200 wpm against the body length the card derives from).
  const minutes = Math.max(1, rm || Math.round(((excerpt || '').length + 1500) / 1000) + 4);

  let coverContent;
  if (cardSvg) {
    coverContent = cardSvg;
  } else if (heroPath) {
    coverContent = `<img src="${escapeAttr(heroPath)}" alt="${escapeAttr(title)}" loading="lazy" />`;
  } else {
    coverContent = `<svg viewBox="0 0 400 250" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><rect width="400" height="250" fill="#14624A"/><text x="200" y="135" text-anchor="middle" font-family="Fraunces,serif" font-size="22" fill="#A8E0BD" font-style="italic">FahmanEnergy</text></svg>`;
  }

  return `<article class="post-card" data-cat="${escapeAttr(category)}">
        <a href="blog/${escapeAttr(slug)}.html" class="pc-cover">
          <span class="pc-tag">${escapeHtml(tagLabel)}</span>
          ${coverContent}
        </a>
        <div class="pc-body">
          <div class="pc-meta">
            <time datetime="${dateIso}">${escapeHtml(datePretty)}</time>
            <span class="dot"></span>
            <span>${minutes} min read</span>
          </div>
          <h3><a href="blog/${escapeAttr(slug)}.html">${escapeHtml(title)}</a></h3>
          <p class="pc-excerpt">${escapeHtml(excerpt)}</p>
          <a href="blog/${escapeAttr(slug)}.html" class="pc-cta">Read more
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
        </div>
      </article>`;
}

/** Best-effort extract of body HTML from a published post page (legacy support). */
export function extractLegacyBody(html) {
  let m = html.match(/<div class="body">([\s\S]*?)<div class="share-row">/);
  if (m) return m[1].trim();
  m = html.match(/<div class="body">([\s\S]*?)<\/div>\s*<\/div>\s*<\/article>/);
  return m ? m[1].trim() : '';
}

/** Best-effort extract of basic meta from a published post page. */
export function extractLegacyMeta(html) {
  const titleM = html.match(/<title>([^<]+?)(?:\s*—\s*FahmanEnergy)?\s*<\/title>/i);
  const descM = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i);
  const tagM = html.match(/<span class="tag-pill">([^<]+)<\/span>/i);
  const dateM = html.match(/<meta\s+property="article:published_time"\s+content="([^"]+)"/i);
  const heroM = html.match(/<div class="cover">[\s\S]*?<img\s+src="([^"]+)"/i);
  return {
    title: (titleM ? titleM[1] : '').trim(),
    excerpt: descM ? descM[1] : '',
    tagLabel: tagM ? tagM[1].trim() : '',
    publishedAt: dateM ? dateM[1] : null,
    heroPath: heroM ? heroM[1] : null,
  };
}

/** Map a tag-pill label back to a category key (best effort). */
export function categoryFromTag(tag) {
  const t = String(tag || '').toLowerCase();
  if (t.includes('vision')) return 'vision';
  if (t.includes('approach') || t.includes('field')) return 'approach';
  if (t.includes('investor')) return 'investors';
  if (t.includes('solar')) return 'solar';
  return 'lpg';
}

/** Remove a single post-card from blog.html matching the given slug. */
export function removeCardFromBlogIndex(html, slug) {
  const escSlug = String(slug).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`\\s*<article class="post-card"[^>]*>[\\s\\S]*?href="/blog/${escSlug}"[\\s\\S]*?<\\/article>\\s*`, 'g');
  return html.replace(re, '\n      ');
}

/** Remove a sitemap <url>...{slug}...</url> block. */
export function removeUrlFromSitemap(xml, slug) {
  const escSlug = String(slug).replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const re = new RegExp(`\\s*<url>\\s*<loc>https://www\\.fahmanenergy\\.com/blog/${escSlug}</loc>[\\s\\S]*?</url>\\s*`, 'g');
  return xml.replace(re, '\n  ');
}

export function injectCardIntoBlogIndex(blogHtml, cardHtml) {
  // Try to insert as the first card inside #postGrid.
  const re = /(<div[^>]*id=["']postGrid["'][^>]*>)([\s\S]*?)(<\/div>\s*(?:<\/div>|<aside|<section)?)/i;
  const m = blogHtml.match(/<div[^>]*id=["']postGrid["'][^>]*>/i);
  if (!m) {
    // Couldn't find the grid; just append before </body>
    return blogHtml.replace(/<\/body>/i, `<!-- post-card -->\n${cardHtml}\n</body>`);
  }
  const idx = m.index + m[0].length;
  return blogHtml.slice(0, idx) + '\n      ' + cardHtml + '\n' + blogHtml.slice(idx);
}

export function injectUrlIntoSitemap(sitemapXml, slug, dateShort) {
  const entry = `  <url>
    <loc>https://www.fahmanenergy.com/blog/${slug}</loc>
    <lastmod>${dateShort}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
`;
  if (sitemapXml.includes(`<loc>https://www.fahmanenergy.com/blog/${slug}</loc>`)) {
    return sitemapXml; // already present
  }
  return sitemapXml.replace(/<\/urlset>\s*$/i, entry + '</urlset>\n');
}
