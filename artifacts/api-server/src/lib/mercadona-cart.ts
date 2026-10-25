import { db, recipesTable, savedMenusTable, weeklyMenusTable, type WeeklyMenuDay } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { buildCartPlan, type MenuSnapshot } from "./mercadona-planner";
import {
  loadMenuSnapshots, loadPurchaseHistory, recordMenuSnapshot, savePlan, type StoredCartPlan,
} from "./mercadona-store";

const SLOTS = ["primero", "segundo", "primero2", "segundo2"] as const;

export function menuRecipeIds(days: WeeklyMenuDay[] | null | undefined): number[] {
  const ids: number[] = [];
  for (const day of days ?? []) {
    for (const meal of [day?.lunch, day?.dinner]) {
      for (const slot of SLOTS) {
        const id = Number(meal?.[slot]?.id);
        if (Number.isSafeInteger(id) && id > 0) ids.push(id);
      }
    }
  }
  return ids;
}

export class MenuNotFoundError extends Error {}

/**
 * Computes the cart for the menu she designed (her current weekly menu, or
 * `menuId`): every ingredient of every dish, with the product and quantity per
 * dish learned from her Mercadona history.
 */
export async function computeCartPlan(userId: number, options: { menuId?: number } = {}): Promise<StoredCartPlan> {
  const menus = await db.select().from(weeklyMenusTable)
    .where(eq(weeklyMenusTable.userId, userId))
    .orderBy(desc(weeklyMenusTable.createdAt), desc(weeklyMenusTable.id));
  const menu = options.menuId ? menus.find(candidate => candidate.id === options.menuId) : menus[0];
  if (options.menuId && !menu) throw new MenuNotFoundError("Menu not found");

  const currentRecipeIds = menu ? menuRecipeIds(menu.days) : [];
  await recordMenuSnapshot(userId, currentRecipeIds);
  const [recipes, saved, snapshots, orders] = await Promise.all([
    db.select().from(recipesTable).where(eq(recipesTable.userId, userId)),
    db.select().from(savedMenusTable).where(eq(savedMenusTable.userId, userId)),
    loadMenuSnapshots(userId),
    loadPurchaseHistory(userId),
  ]);

  // The weekly menu row is edited in place, so its creation date says nothing about
  // when its current dishes were bought: only saved menus and snapshots are history.
  const pastMenus: MenuSnapshot[] = [
    ...saved.map(entry => ({ savedAt: entry.savedAt.toISOString(), recipeIds: menuRecipeIds(entry.days) })),
    ...snapshots,
  ];
  const plan = buildCartPlan({
    menuRecipeIds: currentRecipeIds,
    recipes: recipes.map(recipe => ({ id: recipe.id, name: recipe.name, ingredients: recipe.ingredients ?? [] })),
    pastMenus,
    orders,
  });
  return savePlan(userId, menu?.id ?? null, "tu menú semanal", [], plan);
}
