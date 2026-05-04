// /api/admin/posts
//   GET  → list of published posts (parsed from /sitemap.xml + index card metadata)
//   POST → publish a new post:
//          1. Render markdown body → HTML
//          2. Generate full HTML page from template
//          3. Decode + commit hero image (if any)
//          4. Inject card into blog.html
//          5. Inject URL into sitemap.xml
//          6. Single GitHub commit → Vercel auto-deploys
//
// Body for POST: { title, slug, category, excerpt, body, hero?: { mime, name, dataUrl } }

import { marked } from 'marked';
import { verifySession } from './_lib/auth.js';
import {
  getFileText, fileExists, listDir, commitFiles,
} from './_lib/github.js';
import {
  renderPostPage, renderBlogCard,
  injectCardIntoBlogIndex, injectUrlIntoSitemap,
  isoTimestampLagos,
} from './_lib/template.js';

// Configure marked once for safe defaults.
marked.setOptions({ gfm: true, breaks: false, headerIds: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_HERO_BYTES = 4 * 1024 * 1024;

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
  // Auth
  const session = verifySession(req);
  if (!session) return fail(res, 401, 'Unauthorized');

  if (req.method === 'GET') return list(res);
  if (req.method === 'POST') return publish(req, res, session);
  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, 'Method not allowed');
}

// ---- GET: list posts ----------------------------------------------------
async function list(res) {
  // Parse sitemap.xml — quick, cached on GitHub side.
  const sm = await getFileText('sitemap.xml').catch(() => null);
  if (!sm) return ok(res, { posts: [] });

  // Find which slugs have a source JSON (= editable cleanly via the editor).
  const sources = await listDir('blog/_sources').catch(() => []);
  const editableSlugs = new Set(
    sources
      .filter((f) => f.type === 'file' && f.name.endsWith('.json'))
      .map((f) => f.name.replace(/\.json$/, ''))
  );

  const matches = [...sm.text.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)];
  const posts = matches
    .map((m) => ({ url: m[1], date: m[2] }))
    .filter((p) => /\/blog\/[a-z0-9-]+$/.test(p.url) && !p.url.endsWith('/blog'))
    .map((p) => {
      const slug = p.url.split('/blog/')[1];
      return {
        slug,
        url: p.url,
        date: p.date,
        title: humanize(slug),
        category: 'lpg',
        status: 'published',
        hasSource: editableSlugs.has(slug),
      };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return ok(res, { posts });
}

function humanize(slug) {
  return String(slug || '').replace(/-/g, ' ').replace(/\b(\w)/g, (m) => m.toUpperCase());
}

// ---- POST: publish a new post -------------------------------------------
async function publish(req, res, session) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return fail(res, 400, 'Invalid JSON'); }
  }
  if (!body || typeof body !== 'object') return fail(res, 400, 'Missing body');

  const title    = String(body.title || '').trim();
  const slug     = String(body.slug || '').trim().toLowerCase();
  const category = String(body.category || '').trim().toLowerCase();
  const excerpt  = String(body.excerpt || '').trim();
  const bodyMd   = String(body.body || '');
  const hero     = body.hero || null;

  // Validate
  if (!title || title.length > 160) return fail(res, 400, 'Title is required (max 160 chars)');
  if (!/^[a-z0-9-]{3,80}$/.test(slug)) return fail(res, 400, 'Slug must be 3–80 chars: a–z, 0–9, dashes');
  if (!['lpg','solar','vision','approach','investors'].includes(category)) return fail(res, 400, 'Invalid category');
  if (!excerpt || excerpt.length > 220) return fail(res, 400, 'Excerpt is required (max 220 chars)');
  if (bodyMd.trim().length < 200) return fail(res, 400, 'Body must be at least 200 characters');

  // Slug collision check
  const postPath = `blog/${slug}.html`;
  if (await fileExists(postPath)) {
    return fail(res, 409, `A post with slug "${slug}" already exists. Pick a different slug.`);
  }

  // Decode + validate hero image (if any)
  let heroFile = null;
  let heroPath = null;
  if (hero && hero.dataUrl) {
    if (!ALLOWED_MIME.has(hero.mime)) return fail(res, 400, 'Hero image must be JPG, PNG, or WebP');
    const m = String(hero.dataUrl).match(/^data:([^;]+);base64,(.*)$/);
    if (!m) return fail(res, 400, 'Hero image data URL is malformed');
    if (m[1] !== hero.mime) return fail(res, 400, 'Hero image MIME mismatch');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length === 0)              return fail(res, 400, 'Hero image is empty');
    if (buf.length > MAX_HERO_BYTES)   return fail(res, 400, 'Hero image is over 4MB');
    const ext = hero.mime === 'image/jpeg' ? 'jpg' : hero.mime === 'image/png' ? 'png' : 'webp';
    heroPath = `/blog/img/${slug}/hero.${ext}`;
    heroFile = { path: `blog/img/${slug}/hero.${ext}`, content: buf };
  }

  // Render markdown → HTML
  let bodyHtml = '';
  try {
    bodyHtml = marked.parse(bodyMd);
  } catch (err) {
    console.error('[posts] markdown error', err);
    return fail(res, 400, 'Could not render markdown body');
  }

  // Build the post page
  const publishedAt = new Date();
  const pageHtml = renderPostPage({
    title, slug, category, excerpt, bodyHtml,
    heroPath, heroAlt: title, publishedAt,
  });

  // Update blog.html (inject card)
  const blogIdx = await getFileText('blog.html');
  if (!blogIdx) return fail(res, 500, 'blog.html not found in repo');
  const cardHtml = renderBlogCard({ title, slug, excerpt, category, publishedAt, heroPath });
  const newBlogIdx = injectCardIntoBlogIndex(blogIdx.text, cardHtml);

  // Update sitemap.xml
  const sitemap = await getFileText('sitemap.xml');
  if (!sitemap) return fail(res, 500, 'sitemap.xml not found in repo');
  const dateShort = isoTimestampLagos(publishedAt).slice(0, 10);
  const newSitemap = injectUrlIntoSitemap(sitemap.text, slug, dateShort);

  // Source-of-truth JSON saved alongside the rendered HTML so the post is
  // editable from the admin editor going forward.
  const sourceJson = {
    title, slug, category, excerpt,
    body: bodyMd,
    bodyFormat: 'markdown',
    heroPath: heroPath || null,
    heroAlt: title,
    publishedAt: publishedAt.toISOString(),
    updatedAt: publishedAt.toISOString(),
    publishedBy: session.username,
  };

  // Commit everything in a single tree commit
  const files = [
    { path: postPath, content: pageHtml },
    { path: `blog/_sources/${slug}.json`, content: JSON.stringify(sourceJson, null, 2) },
    { path: 'blog.html', content: newBlogIdx },
    { path: 'sitemap.xml', content: newSitemap },
  ];
  if (heroFile) files.push(heroFile);

  let commit;
  try {
    commit = await commitFiles({
      message: `Blog: publish "${title.slice(0, 60)}" (${slug}) via admin (${session.username})`,
      files,
    });
  } catch (err) {
    console.error('[posts] github commit failed', err);
    return fail(res, 502, `GitHub commit failed: ${err.message}`);
  }

  return ok(res, {
    slug,
    url: `https://www.fahmanenergy.com/blog/${slug}`,
    commitSha: commit.commitSha,
    commitUrl: commit.htmlUrl,
  });
}
