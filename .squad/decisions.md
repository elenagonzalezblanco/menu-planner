# Squad Decisions

## Active Decisions

### [2026-03-31] Browser-Side Storage Architecture (Linus)
**Status:** Implemented

All keys follow `{userId}:{entity}` format (e.g., `default:recipes`). Full recipe objects stored inline in `WeeklyMenu.days` — no join complexity at read time. `generateMenu` uses deterministic fish/meat interleaving with day-of-week profiles (jueves: no primeros; lunes: dinner no primero; viernes: both meals get primero). TanStack Query wraps synchronous storage via `Promise.resolve()`. `getCurrentUserId()` reads `sessionStorage['current_user_id']`, defaults to `'default'`.

Files: `storage.ts`, `recipes-storage.ts`, `menus-storage.ts`, `shopping-storage.ts`, `use-local-storage.ts`

---

### [2026-03-31] Local Multi-User Profile System (Livingston)
**Status:** Implemented

Users stored in `localStorage['menu_planner_users']` as `{ id, name, avatar, createdAt }[]`. Session tracked in `sessionStorage['current_user_id']` (resets on tab close). App gated at root: null user shows full-screen `UserSelector`; confirmed user renders router. `WouterRouter` placed inside `AppShell` after user confirmed. Delete guard: delete only shown when 2+ users exist.

| Key | Storage | Contents |
|-----|---------|---------|
| `menu_planner_users` | localStorage | `User[]` |
| `current_user_id` | sessionStorage | `string` (UUID) |

Files created: `users-storage.ts`, `UserContext.tsx`, `UserSelector.tsx`. Modified: `App.tsx`, `Layout.tsx`.

---

### [2026-03-31] Static Build Config for GitHub Pages (Rusty)
**Status:** Implemented

`VITE_BASE_PATH` replaces `BASE_PATH` (Vite-exposed, falls back to `/`; set to `/menu-planner-v2/` in CI). All `@replit/*` plugins removed. `build.outDir` changed from `dist/public` to `dist`. `useSearchMercadona` stubbed (no backend proxy on Pages). `useMenu(id)` single-item getter dropped to eliminate `@workspace/api-client-react` imports. SPA routing via `?/` redirect pattern in `public/404.html`.

---

### [2026-03-31] Menu.tsx localStorage Migration (Rusty)
**Status:** Implemented

Query keys replaced with local storage keys. `saveMenu` uses direct `storageGet`/`storageSet`. `handleCreateShoppingList` signature changed from `(menuId: number)` to `(menuId: string)`; `mutate({ data: { menuId } })` → `mutate(menuId)`. AI chat panel removed (requires OpenAI backend); replaced with "🎲 Generar nuevo menú" card. Type cast `as unknown as Recipe[]` used where local `Recipe.id: number` conflicts with storage `Recipe.id: string`.

---

### [2026-03-31] SEO & PWA Setup (Basher)
**Status:** Done — open items pending user action

`lang="en"` → `lang="es"`. Accessible viewport (no `maximum-scale`). `theme-color: #16a34a`. Canonical + Open Graph added. `manifest.json` with `display: standalone`, `start_url: "./"`, two icon sizes with `purpose: "any maskable"`. Permissive `robots.txt` + single-URL `sitemap.xml`.

Open items: user must add `icon-192.png` / `icon-512.png` to `public/icons/` and replace `YOUR_USERNAME` in `index.html`, `robots.txt`, `sitemap.xml`.

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
