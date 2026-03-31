# Rusty — History

## Project Seeding
- Project: menu-planner-v2 (weekly Spanish home-cooking meal planner)
- Stack: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter
- Migration: Express/PostgreSQL → browser localStorage + GitHub Pages
- Current vite.config requires PORT and BASE_PATH env vars — needs to be fixed for static build
- Current hooks use @workspace/api-client-react (generated from OpenAPI) — needs replacement

## Learnings
- vite.config.ts had top-level `await` for dynamic Replit plugin imports — removing them simplifies to a synchronous defineConfig call
- The four hooks files (`use-recipes`, `use-menus`, `use-shopping`, `use-mercadona`) all imported from `@workspace/api-client-react`; migrated to re-export from `../lib/use-local-storage` (created by Linus) except mercadona which is stubbed out
- `use-menus.ts` had a `useMenu(id)` helper not covered by the localStorage layer spec — dropped it to avoid dangling API imports; pages using it may need updates
- GitHub Pages SPA routing requires both `public/404.html` (redirect on 404) and an inline script in `index.html` (decode the redirect) — the `?/path` encoding trick handles deep links
- `build.outDir` changed from `dist/public` to `dist` for simpler GitHub Actions artifact upload path
- `VITE_BASE_PATH` env var in the workflow is set to `/menu-planner-v2/` — must match the actual repo name on GitHub Pages
- `Menu.tsx` had two incompatible type casts (`recipesData as Recipe[]` and `latestMenu.days as DayPlan[]`) because local Recipe has `id: number` but storage Recipe has `id: string` — must use double-cast via `unknown` (`as unknown as Recipe[]`) to satisfy TypeScript
- When removing an AI chat feature, clean up: the interface, constants, all state vars, both useEffects, the function, the JSX panel, the helper component (ChatBubble), and all associated lucide-react icon imports — missing any one causes dead code or unused-variable errors
- `useGenerateShoppingList` in the localStorage layer takes a plain `string` (menuId), not `{ data: { menuId } }` as the old API client expected — call sites must be updated when migrating
