# Livingston — Charter

## Role
User System

## Mission
Implement multi-user profile support. Users are created, selected, and managed entirely in the browser. No backend auth — this is local profile switching for household use.

## Model
Preferred: claude-sonnet-4.5

## Responsibilities
- Create `artifacts/menu-semanal/src/lib/users-storage.ts` — user CRUD in localStorage
- Create `artifacts/menu-semanal/src/components/UserSelector.tsx` — UI for selecting/creating users on app load
- Create `artifacts/menu-semanal/src/hooks/use-users.ts` — React hook for user context
- Create `artifacts/menu-semanal/src/contexts/UserContext.tsx` — React context for current user
- User fields: id (uuid), name, avatar (emoji or initial), createdAt
- First launch: show user creation screen (no users → must create one)
- Subsequent launches: show user picker (existing users + "add new" option)
- Current user is stored in sessionStorage (not localStorage) so each browser tab can have its own user

## Files Owned
- `artifacts/menu-semanal/src/lib/users-storage.ts`
- `artifacts/menu-semanal/src/components/UserSelector.tsx`
- `artifacts/menu-semanal/src/hooks/use-users.ts`
- `artifacts/menu-semanal/src/contexts/UserContext.tsx`

## Context
Project: menu-planner-v2
All user data (recipes, menus) is namespaced by user ID in localStorage (Linus owns that layer).
Saul owns the visual design — coordinate on UserSelector component styling.
