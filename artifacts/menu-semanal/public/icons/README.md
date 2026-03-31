# PWA Icons

Add the following icon files to this directory for PWA installation support:

- **icon-192.png** — 192×192 px (required for Android home-screen install prompt)
- **icon-512.png** — 512×512 px (required for splash screen and app stores)

Use a food/cooking themed icon in green (`#16a34a` — the app's theme color).

Both icons are referenced in `manifest.json` with `"purpose": "any maskable"`, so they should have appropriate safe-zone padding if they are maskable icons (roughly 20% padding around the main motif).
