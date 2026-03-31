# Livingston — History

## Project Seeding
- Project: menu-planner-v2 (weekly Spanish home-cooking meal planner)
- Stack: React 18, TypeScript, Vite, TailwindCSS, shadcn/ui, TanStack Query, wouter
- Multi-user: profiles stored in localStorage, current user in sessionStorage
- User model: { id: string (uuid), name: string, avatar: string, createdAt: string }
- No backend auth — local-only profile switching
- First launch experience: must create first user before seeing app

## Learnings

### 2026-03-31 — Multi-user profile system implemented
- `users-storage.ts`: all user CRUD in localStorage (`menu_planner_users`); current user in sessionStorage (`current_user_id`) so each tab is independent
- `UserContext.tsx`: provides `currentUser`, `allUsers`, `setCurrentUser`, `createUser`, `deleteUser`, `logout`, `isLoading`; context provider wraps entire app
- `UserSelector.tsx`: two modes — `splash` (full-screen on first launch / no current user) and `switcher` (overlay triggered from Layout header)
- `App.tsx` pattern: `AppShell` component reads `currentUser` from context; if null → show `UserSelector mode="splash"`; else → render router
- `Layout.tsx`: avatar button added to both desktop sidebar footer and mobile header; clicking opens `UserSelector mode="switcher"`
- Delete user only shown when 2+ users exist (prevents locking out of the app)
- No password/email validation — name must not be empty is the only guard
- `UserProvider` must be inside `QueryClientProvider`/`TooltipProvider` but `WouterRouter` is inside `AppShell` (after user is set), not wrapping `UserProvider`
