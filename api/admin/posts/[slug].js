// /api/admin/posts/[slug]
//   GET    → load a post for the editor (source JSON if available, else parsed HTML)
//   PUT    → update the post (regenerates HTML, refreshes blog.html card, commits)
//   DELETE → unpublish (removes HTML + source + card + sitemap entry)
//
// Slug changes are not allowed — slug is permanent for SEO. Delete + republish
// to change a slug.

import { marked } from 'marked';
import { verifySession } from '../_lib/auth.js';
import { getFileText, fileExists, commitFiles } from '../_lib/github.js';
import {
  renderPostPage, renderBlogCard,
  injectCardIntoBlogIndex, injectUrlIntoSitemap,
  removeCardFromBlogIndex, removeUrlFromSitemap,
  extractLegacyBody, extractLegacyMeta, categoryFromTag,
  isoTimestampLagos,
} from '../_lib/template.js';

marked.setOptions({ gfm: true, breaks: false, headerIds: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_HERO_BYTES = 4 * 1024 * 1024;

function ok(res, payload)        { res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json; charset=utf-8'); return res.status(200).json({ ok:true, ...payload }); }
function fail(res, status, error){ res.setHeader('Cache-Control','no-store'); res.setHeader('Content-Type','application/json; charset=utf-8'); return res.status(status).json({ ok:false, error }); }

export default async function handler(req, res) {
  const session = verifySession(req);
  if (!session) return fail(res, 401, 'Unauthorized');

  const slug = String(req.query?.slug || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return fail(res, 400, 'Invalid slug');

  if (req.method === 'GET')    return loadForEditor(slug, res);
  if (req.method === 'PUT')    return update(slug, req, res, session);
  if (req.method === 'DELETE') return unpublish(slug, res, session);

  res.setHeader('Allow', 'GET, PUT, DELETE');
  return fail(res, 405, 'Method not allowed');
}

// ---- GET --------------------------------------------------------------
async function loadForEditor(slug, res) {
  // Prefer the source JSON.
  const src = await getFileText(`blog/_sources/${slug}.json`).catch(() => null);
  if (src) {
    let parsed;
    try { parsed = JSON.parse(src.text); } catch { return fail(res, 500, 'Source JSON is malformed'); }
    return ok(res, {
      post: {
        slug,
        title:        parsed.title || '',
        category:     parsed.category || 'lpg',
        excerpt:      parsed.excerpt || '',
        body:         parsed.body || '',
        bodyFormat:   parsed.bodyFormat || 'markdown',
        heroPath:     parsed.heroPath || null,
        publishedAt:  parsed.publishedAt || null,
        updatedAt:    parsed.updatedAt || null,
        isLegacy:     false,
      },
    });
  }

  // Fallback: parse the published HTML.
  const html = await getFileText(`blog/${slug}.html`).catch(() => null);
  if (!html) return fail(res, 404, 'Post not found');

  const meta = extractLegacyMeta(html.text);
  const body = extractLegacyBody(html.text);
  return ok(res, {
    post: {
      slug,
      title:        meta.title || slug,
      category:     categoryFromTag(meta.tagLabel),
      excerpt:      meta.excerpt || '',
      body:         body,
      bodyFormat:   'html',
      heroPath:     meta.heroPath || null,
      publishedAt:  meta.publishedAt || null,
      updatedAt:    meta.publishedAt || null,
      isLegacy:     true,
      note:         'This post was published before edit tracking. The body is the raw HTML — edit carefully or replace with markdown by switching format.',
    },
  });
}

// ---- PUT --------------------------------------------------------------
async function update(slug, req, res, session) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return fail(res, 400, 'Missing body');

  const title      = String(body.title || '').trim();
  const category   = String(body.category || '').trim().toLowerCase();
  const excerpt    = String(body.excerpt || '').trim();
  const bodySource = String(body.body || '');
  const bodyFormat = body.bodyFormat === 'html' ? 'html' : 'markdown';
  const hero       = body.hero === undefined ? 'keep' : body.hero; // null | dataUrl | 'keep'

  // Validate
  if (!title || title.length > 160) return fail(res, 400, 'Title is required (max 160 chars)');
  if (!['lpg','solar','vision','approach','investors'].includes(category)) return fail(res, 400, 'Invalid category');
  if (!excerpt || excerpt.length > 220) return fail(res, 400, 'Excerpt is required (max 220 chars)');
  if (bodySource.trim().length < 50) return fail(res, 400, 'Body is too short');

  // Body slug in URL must be the post being edited; prevent slug-change.
  if (body.slug && String(body.slug).trim().toLowerCase() !== slug) {
    return fail(res, 400, 'Slug cannot be changed (delete + republish to rename)');
  }

  // Make sure the post still exists.
  const existingHtml = await getFileText(`blog/${slug}.html`).catch(() => null);
  if (!existingHtml) return fail(res, 404, 'Post not found');

  // Existing source (may not exist for legacy posts).
  const existingSrcText = await getFileText(`blog/_sources/${slug}.json`).catch(() => null);
  const existingSrc = existingSrcText ? safeJson(existingSrcText.text) : null;

  // Render the body.
  let bodyHtml = '';
  try {
    bodyHtml = bodyFormat === 'markdown' ? marked.parse(bodySource) : bodySource;
  } catch (err) {
    console.error('[posts/:slug PUT] markdown error', err);
    return fail(res, 400, 'Could not render body');
  }

  // Hero handling
  let heroPath = existingSrc?.heroPath || null;
  let heroFile = null;
  if (hero === null) {
    heroPath = null;
  } else if (hero && typeof hero === 'object' && hero.dataUrl) {
    if (!ALLOWED_MIME.has(hero.mime)) return fail(res, 400, 'Hero image must be JPG, PNG, or WebP');
    const m = String(hero.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m || m[1] !== hero.mime) return fail(res, 400, 'Hero image data URL is malformed');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0) return fail(res, 400, 'Hero image is empty');
    if (buf.length > MAX_HERO_BYTES) return fail(res, 400, 'Hero image is over 4MB');
    const ext = hero.mime === 'image/jpeg' ? 'jpg' : hero.mime === 'image/png' ? 'png' : 'webp';
    heroPath = `/blog/img/${slug}/hero.${ext}`;
    heroFile = { path: `blog/img/${slug}/hero.${ext}`, content: buf };
  }
  // If hero === 'keep' (default) → leave heroPath as it was.

  // Determine timestamps
  const now = new Date();
  const publishedAt = existingSrc?.publishedAt ? new Date(existingSrc.publishedAt) : now;

  // Build full HTML page
  const pageHtml = renderPostPage({
    title, slug, category, excerpt, bodyHtml,
    heroPath, heroAlt: title, publishedAt,
  });

  // Refresh card in blog.html: remove old card + insert new one at top
  const blogIdx = await getFileText('blog.html');
  if (!blogIdx) return fail(res, 500, 'blog.html not found in repo');
  const cardHtml = renderBlogCard({ title, slug, excerpt, category, publishedAt, heroPath });
  const blogIdxNoOld = removeCardFromBlogIndex(blogIdx.text, slug);
  const newBlogIdx   = injectCardIntoBlogIndex(blogIdxNoOld, cardHtml);

  // Update sitemap lastmod (remove old + re-inject)
  const sitemap = await getFileText('sitemap.xml');
  if (!sitemap) return fail(res, 500, 'sitemap.xml not found in repo');
  const dateShort = isoTimestampLagos(now).slice(0, 10);
  const sitemapNoOld = removeUrlFromSitemap(sitemap.text, slug);
  const newSitemap   = injectUrlIntoSitemap(sitemapNoOld, slug, dateShort);

  // Build new source JSON
  const newSource = {
    title, slug, category, excerpt,
    body: bodySource,
    bodyFormat,
    heroPath,
    heroAlt: title,
    publishedAt: publishedAt.toISOString(),
    updatedAt: now.toISOString(),
    publishedBy: existingSrc?.publishedBy || session.username,
    updatedBy: session.username,
  };

  // Commit
  const files = [
    { path: `blog/${slug}.html`, content: pageHtml },
    { path: `blog/_sources/${slug}.json`, content: JSON.stringify(newSource, null, 2) },
    { path: 'blog.html', content: newBlogIdx },
    { path: 'sitemap.xml', content: newSitemap },
  ];
  if (heroFile) files.push(heroFile);

  let commit;
  try {
    commit = await commitFiles({
      message: `Blog: update "${title.slice(0, 60)}" (${slug}) via admin (${session.username})`,
      files,
    });
  } catch (err) {
    console.error('[posts/:slug PUT] github commit failed', err);
    return fail(res, 502, `GitHub commit failed: ${err.message}`);
  }

  return ok(res, {
    slug,
    url: `https://www.fahmanenergy.com/blog/${slug}`,
    commitSha: commit.commitSha,
    commitUrl: commit.htmlUrl,
  });
}

// ---- DELETE -----------------------------------------------------------
async function unpublish(slug, res, session) {
  // The commitFiles helper writes; deletes use the GitHub Contents DELETE
  // endpoint directly (one call per file). After the file deletes succeed,
  // we batch the blog.html + sitemap.xml cleanup into a single tree commit.
  const ghHeaders = {
    'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'fahman-energy-admin/1.0',
    'Content-Type': 'application/json',
  };
  const repoBase = `https://api.github.com/repos/Jeebz-a/fahman-energy-website/contents`;

  async function ghGet(path) {
    const r = await fetch(`${repoBase}/${path}?ref=main`, { headers: ghHeaders });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GET ${path} ${r.status}`);
    return r.json();
  }
  async function ghDel(path, sha, message) {
    const r = await fetch(`${repoBase}/${path}`, {
      method: 'DELETE',
      headers: ghHeaders,
      body: JSON.stringify({ message, sha, branch: 'main' }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`DELETE ${path} ${r.status} ${t.slice(0, 120)}`);
    }
    return r.json();
  }

  // Delete the HTML, source JSON, and any hero image variants.
  const targets = [
    `blog/${slug}.html`,
    `blog/_sources/${slug}.json`,
    `blog/img/${slug}/hero.jpg`,
    `blog/img/${slug}/hero.png`,
    `blog/img/${slug}/hero.webp`,
  ];
  let deletedAny = false;
  for (const t of targets) {
    try {
      const info = await ghGet(t);
      if (!info || !info.sha) continue;
      await ghDel(t, info.sha, `Blog: unpublish "${slug}" via admin (${session.username})`);
      deletedAny = true;
    } catch (err) {
      // Non-fatal — continue with other targets.
      console.warn(`[unpublish] ${t}:`, err.message);
    }
  }

  if (!deletedAny) return fail(res, 404, 'Post not found');

  // Update blog.html + sitemap.xml as a single tree commit.
  const blogIdx = await getFileText('blog.html').catch(() => null);
  const sitemap = await getFileText('sitemap.xml').catch(() => null);
  const writes = [];
  if (blogIdx) writes.push({ path: 'blog.html', content: removeCardFromBlogIndex(blogIdx.text, slug) });
  if (sitemap) writes.push({ path: 'sitemap.xml', content: removeUrlFromSitemap(sitemap.text, slug) });
  if (writes.length) {
    try {
      await commitFiles({
        message: `Blog: remove "${slug}" from index + sitemap (admin: ${session.username})`,
        files: writes,
      });
    } catch (err) {
      console.error('[unpublish] tree commit failed', err);
      return fail(res, 502, `Cleanup commit failed: ${err.message}`);
    }
  }

  return ok(res, { slug, deleted: true });
}

function safeJson(text) {
  try { return JSON.parse(text); } catch { return null; }
}
