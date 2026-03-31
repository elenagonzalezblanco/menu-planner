import { storageGet, storageSet } from './storage';
import { getMenu } from './menus-storage';

export interface ShoppingListItem {
  ingredient: string;
  recipes: string[];
}

export interface ShoppingList {
  menuId: string;
  items: ShoppingListItem[];
  generatedAt: string;
}

function shoppingKey(menuId: string): string {
  return `shopping:${menuId}`;
}

export function generateShoppingList(userId: string, menuId: string): ShoppingList {
  const menu = getMenu(userId, menuId);

  const ingredientMap = new Map<string, Set<string>>();

  if (menu) {
    for (const day of menu.days) {
      const recipes = [
        day.lunch?.primero,
        day.lunch?.segundo,
        day.dinner?.primero,
        day.dinner?.segundo,
      ];
      for (const recipe of recipes) {
        if (!recipe) continue;
        for (const ing of recipe.ingredients ?? []) {
          const normalized = ing.trim().toLowerCase();
          if (!normalized) continue;
          if (!ingredientMap.has(normalized)) ingredientMap.set(normalized, new Set());
          ingredientMap.get(normalized)!.add(recipe.name);
        }
      }
    }
  }

  const items: ShoppingListItem[] = Array.from(ingredientMap.entries()).map(
    ([ingredient, recipeNames]) => ({
      ingredient: ingredient.charAt(0).toUpperCase() + ingredient.slice(1),
      recipes: Array.from(recipeNames),
    }),
  );

  const shoppingList: ShoppingList = {
    menuId,
    items,
    generatedAt: new Date().toISOString(),
  };

  storageSet(userId, shoppingKey(menuId), shoppingList);
  return shoppingList;
}

export function getShoppingList(userId: string, menuId: string): ShoppingList | null {
  return storageGet<ShoppingList>(userId, shoppingKey(menuId));
}
