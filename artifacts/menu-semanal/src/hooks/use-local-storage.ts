import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from '@tanstack/react-query';

import {
  listRecipes,
  getRecipe,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  seedDefaultRecipes,
  type Recipe,
} from '../lib/recipes-storage';

import {
  listMenus,
  getMenu,
  generateMenu,
  deleteMenu,
  type WeeklyMenu,
} from '../lib/menus-storage';

import {
  generateShoppingList,
  getShoppingList,
  type ShoppingList,
} from '../lib/shopping-storage';

// ── User identity ─────────────────────────────────────────────────────────────

/**
 * Returns the current user ID from sessionStorage.
 * Falls back to 'default' for single-user / unauthenticated usage.
 */
export function getCurrentUserId(): string {
  return sessionStorage.getItem('current_user_id') ?? 'default';
}

// ── Query key factories ───────────────────────────────────────────────────────

export const recipesQueryKey = (userId: string, category?: string) =>
  category ? ['recipes', userId, category] : ['recipes', userId];

export const menusQueryKey = (userId: string) => ['menus', userId];

export const shoppingQueryKey = (userId: string, menuId: string) => [
  'shopping',
  userId,
  menuId,
];

// ── Recipe hooks ──────────────────────────────────────────────────────────────

export function useRecipes(category?: string): UseQueryResult<Recipe[]> {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: recipesQueryKey(userId, category),
    queryFn: () => {
      seedDefaultRecipes(userId); // No-op if recipes already exist
      return listRecipes(userId, category);
    },
  });
}

export function useRecipe(id: string): UseQueryResult<Recipe | null> {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: ['recipe', userId, id],
    queryFn: () => getRecipe(userId, id),
    enabled: !!id,
  });
}

export function useCreateRecipe(): UseMutationResult<
  Recipe,
  Error,
  Omit<Recipe, 'id' | 'createdAt'>
> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: (input: Omit<Recipe, 'id' | 'createdAt'>) => Promise.resolve(createRecipe(userId, input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', userId] });
    },
  });
}

export function useUpdateRecipe(): UseMutationResult<
  Recipe | null,
  Error,
  { id: string; input: Partial<Omit<Recipe, 'id' | 'createdAt'>> }
> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<Omit<Recipe, 'id' | 'createdAt'>> }) => Promise.resolve(updateRecipe(userId, id, input)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', userId] });
    },
  });
}

export function useDeleteRecipe(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: id => Promise.resolve(deleteRecipe(userId, id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recipes', userId] });
    },
  });
}

// ── Menu hooks ────────────────────────────────────────────────────────────────

export function useMenus(): UseQueryResult<WeeklyMenu[]> {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: menusQueryKey(userId),
    queryFn: () => listMenus(userId),
  });
}

export function useMenu(id: string): UseQueryResult<WeeklyMenu | null> {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: ['menu', userId, id],
    queryFn: () => getMenu(userId, id),
    enabled: !!id,
  });
}

export function useGenerateMenu(): UseMutationResult<
  WeeklyMenu,
  Error,
  Parameters<typeof generateMenu>[1]
> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: options => Promise.resolve(generateMenu(userId, options)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menusQueryKey(userId) });
    },
  });
}

export function useDeleteMenu(): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: id => Promise.resolve(deleteMenu(userId, id)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: menusQueryKey(userId) });
    },
  });
}

// ── Shopping list hooks ───────────────────────────────────────────────────────

export function useShoppingList(menuId: string): UseQueryResult<ShoppingList | null> {
  const userId = getCurrentUserId();
  return useQuery({
    queryKey: shoppingQueryKey(userId, menuId),
    queryFn: () => getShoppingList(userId, menuId),
    enabled: !!menuId,
  });
}

export function useGenerateShoppingList(): UseMutationResult<ShoppingList, Error, string> {
  const queryClient = useQueryClient();
  const userId = getCurrentUserId();
  return useMutation({
    mutationFn: menuId => Promise.resolve(generateShoppingList(userId, menuId)),
    onSuccess: (_, menuId) => {
      queryClient.invalidateQueries({ queryKey: shoppingQueryKey(userId, menuId) });
    },
  });
}
