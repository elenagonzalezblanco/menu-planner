# Linus — History

## Project Seeding
- Project: menu-planner-v2 (weekly Spanish home-cooking meal planner)
- Stack: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter
- Migration goal: replace all Express API routes with browser localStorage
- Data entities: Recipe, WeeklyMenu (with DayMenu/MealPlan), ShoppingList, MercadonaProduct
- Menu generation currently uses OpenAI GPT — must reimplement as local algorithm
- Historical preferences and combinaciones are defined in artifacts/api-server/src/routes/menus.ts

## Learnings

### 2026-03-31 — Browser-side data layer built

**Architecture decisions:**
- All data stored in `localStorage` with keys `{userId}:{entity}` and `{userId}:shopping:{menuId}`
- Types are self-contained in each storage file (no import from `@workspace/api-client-react`)
- IDs use `crypto.randomUUID()` (strings), unlike the old numeric DB IDs
- `getCurrentUserId()` reads `sessionStorage['current_user_id']`, defaults to `'default'`

**Key file paths created:**
- `artifacts/menu-semanal/src/lib/storage.ts` — core `storageGet/storageSet/storageDelete/generateId`
- `artifacts/menu-semanal/src/lib/recipes-storage.ts` — full CRUD + 15 seeded Spanish recipes
- `artifacts/menu-semanal/src/lib/menus-storage.ts` — `generateMenu` local algorithm + CRUD
- `artifacts/menu-semanal/src/lib/shopping-storage.ts` — aggregate ingredients from menu recipes
- `artifacts/menu-semanal/src/hooks/use-local-storage.ts` — TanStack Query hooks wrapping all above

**Menu generation algorithm:**
- Separates recipes into primeros / fishSegundos / meatSegundos / otros buckets
- Interleaves fish/meat at ratio ~1:2 (every 3rd slot = fish)
- Applies day-of-week profiles from HISTORICAL_CONTEXT (Jueves: no primero, Lunes: dinner no primero, Viernes: primero both meals)
- Parses structural constraints from `preferences` text (no fish at lunch/dinner, no primero at lunch/dinner)
- Full recipe objects stored inline in WeeklyMenu (avoids lookup join at read time)

**Seed recipes (15 total):**
- 5 primeros: Gazpacho, Salmorejo, Crema de zanahoria, Vichyssoise, Sopa de calabacín
- 7 segundos: Pollo de la abuela, Albóndigas, Pechugas empanadas, Judías verdes con jamón, Merluza al horno, Merluza frita, Dorada a la sal
- 3 otros: Arroz con tomate y jamón York, Espaguetis con tomate, Tortilla de patata
