# Basher — History

## Project Seeding
- Project: menu-planner-v2 (weekly Spanish home-cooking meal planner)
- Deployment: GitHub Pages (static SPA, no SSR)
- Routing: wouter client-side router with base path
- Mobile use primary — PWA/installability is the key SEO/discovery goal
- Existing index.html: minimal, Replit-oriented

## Learnings

### 2026-03-31 — PWA & SEO pass
- Updated `index.html`: lang set to `es`, added theme-color, canonical, og:*, PWA manifest link, apple-touch-icon, apple-mobile-web-app-* meta tags. Kept existing favicon, Google Fonts links, and module script intact.
- Created `public/manifest.json` with standalone display, green theme, and both 192/512 icon entries.
- Created `public/robots.txt` (allow all) and `public/sitemap.xml` (single URL entry).
- Created `public/icons/README.md` as placeholder — actual PNG icons must be added manually by the user.
- `YOUR_USERNAME` placeholder left in canonical, robots.txt, and sitemap.xml — user must replace with their GitHub username.
- `manifest.json` uses `"purpose": "any maskable"` on both icons; icons directory is empty pending user-supplied PNGs.
