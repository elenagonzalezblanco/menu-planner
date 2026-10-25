import { db, recipesTable, savedMenusTable, weeklyMenusTable, type WeeklyMenuDay } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { buildCartPlan, type MenuSnapshot } from "./mercadona-planner";
import { latestPlan, loadPurchaseHistory, savePlan, type StoredCartPlan } from "./mercadona-store";
import { listWhatsAppIngredients } from "./whatsapp-store";

const SLOTS = ["primero", "segundo", "primero2", "segundo2"] as const;
const MAX_EXTRA_INGREDIENTS = 100;

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

export function parseExtraIngredients(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const extras: string[] = [];
  for (const item of value.slice(0, MAX_EXTRA_INGREDIENTS)) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, 120);
    const key = trimmed.toLocaleLowerCase("es");
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      extras.push(trimmed);
    }
  }
  return extras;
}

export class MenuNotFoundError extends Error {}

/**
 * Computes the cart for the user's latest weekly menu (or `menuId`) from her
 * Mercadona history, WhatsApp additions and the ingredients she added by hand.
 * When the connector asks without extras, the ones from her last plan for the
 * same menu are reused so a plan prepared in the app is not lost.
 */
export async function computeCartPlan(
  userId: number, options: { menuId?: number; extraIngredients?: string[] } = {},
): Promise<StoredCartPlan> {
  const menus = await db.select().from(weeklyMenusTable)
    .where(eq(weeklyMenusTable.userId, userId))
    .orderBy(desc(weeklyMenusTable.createdAt), desc(weeklyMenusTable.id));
  const menu = options.menuId ? menus.find(candidate => candidate.id === options.menuId) : menus[0];
  if (options.menuId && !menu) throw new MenuNotFoundError("Menu not found");

  const [recipes, saved, orders, whatsapp] = await Promise.all([
    db.select().from(recipesTable).where(eq(recipesTable.userId, userId)),
    db.select().from(savedMenusTable).where(eq(savedMenusTable.userId, userId)),
    loadPurchaseHistory(userId),
    listWhatsAppIngredients(userId),
  ]);

  let manual = options.extraIngredients;
  if (manual === undefined) {
    const previous = await latestPlan(userId);
    manual = previous && previous.menuId === (menu?.id ?? null) ? previous.extraIngredients : [];
  }

  const pastMenus: MenuSnapshot[] = [
    ...saved.map(entry => ({ savedAt: entry.savedAt.toISOString(), recipeIds: menuRecipeIds(entry.days) })),
    ...menus.map(entry => ({ savedAt: entry.createdAt.toISOString(), recipeIds: menuRecipeIds(entry.days) })),
  ];
  const plan = buildCartPlan({
    menuRecipeIds: menu ? menuRecipeIds(menu.days) : [],
    recipes: recipes.map(recipe => ({ id: recipe.id, name: recipe.name, ingredients: recipe.ingredients ?? [] })),
    pastMenus,
    orders,
    extraIngredients: [...whatsapp.map(item => item.ingredient), ...manual],
  });
  const label = menu ? "tu menú semanal" : "tu lista sin menú";
  return savePlan(userId, menu?.id ?? null, label, manual, plan);
}
