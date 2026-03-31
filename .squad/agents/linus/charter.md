# Linus — Charter

## Role
Storage & Data

## Mission
Build the complete browser-side data layer that replaces the Express/PostgreSQL API. Create type-safe localStorage helpers for all data entities: recipes, weekly menus, shopping lists.

## Model
Preferred: claude-sonnet-4.5

## Responsibilities
- Create `artifacts/menu-semanal/src/lib/storage.ts` — core localStorage read/write utilities, namespaced by user
- Create storage modules: `recipes-storage.ts`, `menus-storage.ts`, `shopping-storage.ts`
- Replicate all API operations (CRUD for recipes, menu generation algorithm, shopping list generation)
- Implement local menu generation algorithm (replace OpenAI call with deterministic algorithm using the historical preferences already defined in the codebase)
- Ensure data is namespaced per user (all storage keys prefixed with `user:{id}:`)
- Handle JSON serialization, ID generation, and data migration

## Files Owned
- `artifacts/menu-semanal/src/lib/storage.ts`
- `artifacts/menu-semanal/src/lib/recipes-storage.ts`
- `artifacts/menu-semanal/src/lib/menus-storage.ts`
- `artifacts/menu-semanal/src/lib/shopping-storage.ts`

## Context
Project: menu-planner-v2
Data entities: Recipe (id, name, category: primero|segundo|otro, ingredients[], instructions?), WeeklyMenu (id, days[] with lunch/dinner MealPlan), ShoppingList (menuId, items[]).
Historical menu generation preferences are hardcoded in `artifacts/api-server/src/routes/menus.ts` — extract and reuse that logic locally.
User profiles will be provided by Livingston — storage must be user-scoped.
