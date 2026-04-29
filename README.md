# FahmanEnergy Website

Multi-page static marketing site for **Fahman Oil & Gas Ltd** (trading as Fahman / FahmanEnergy) — Nigeria's solar-powered LPG retail and distribution company.

- **HQ:** Pipeline Area, Ilorin, Kwara State, Nigeria
- **Branch:** Ilesha Baruba
- **Email:** Fahmanltd@gmail.com
- **Phone:** +234 706 086 8580
- **Licensing:** NMDPRA licensed · SON approved
- **Capacity:** 10 MT plant operational
- **Roadmap:** Solar electricity rollout from 2028

## Pages

| URL | File | Purpose |
|---|---|---|
| `/` | `index.html` | Home — hero, value props, services overview |
| `/about` | `about.html` | Story, journey illustration, 2026→2033 expansion map |
| `/services` | `services.html` | LPG refill, bulk supply, consultancy, equipment, solar |
| `/solar` | `solar.html` | Rural solar electricity vision (launching 2028) |
| `/investors` | `investors.html` | Investor & partner relations |
| `/contact` | `contact.html` | Contact info with `LocalBusiness` schema |

## SEO

Every page ships with a comprehensive SEO bundle:

- **Meta:** description, keywords, author, robots, theme-color, geo.region (`NG-KW`), geo.position
- **Canonical** + `hreflang` (`en-NG`, `en`, `x-default`)
- **Open Graph** (Facebook, LinkedIn, Slack, WhatsApp share previews)
- **Twitter / X** card (`summary_large_image`)
- **Favicon** (`favicon.svg`) + `apple-touch-icon.svg` + PWA `site.webmanifest`
- **JSON-LD structured data** with `@graph` of:
  - `Organization` (NAP, credentials, `areaServed`, `knowsAbout`)
  - `WebSite` with `SearchAction`
  - Page-specific: `WebPage`, `AboutPage`, `ContactPage`, `Service`, `ItemList`, `BreadcrumbList`, `LocalBusiness`
- **`robots.txt`** explicitly allows GPTBot, ChatGPT-User, OAI-SearchBot, PerplexityBot, ClaudeBot, Google-Extended, Applebot-Extended, CCBot, etc. — so we appear in **AI search results** (ChatGPT, Perplexity, Claude, Gemini, Apple Intelligence) as well as Google/Bing.
- **`sitemap.xml`** with `image:` entries

### Updating the canonical domain

When you point a custom domain at this Vercel project, run a global find-and-replace on `https://fahman-energy-website.vercel.app` → `https://yourdomain.com` across all six HTML files plus `robots.txt` and `sitemap.xml`.

## Local preview

```bash
python3 -m http.server 8080
```

Then visit http://localhost:8080.

## Deployment

Deployed on **Vercel** with auto-deploys from the `main` branch. `vercel.json` enables clean URLs (`/about` instead of `/about.html`).

Repo: https://github.com/Jeebz-a/fahman-energy-website
