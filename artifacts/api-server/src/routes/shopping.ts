import { Router, type IRouter } from "express";
import { db, recipesTable, weeklyMenusTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { GenerateShoppingListBody, GetShoppingListParams } from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/shopping-list/generate", async (req: AuthenticatedRequest, res) => {
  try {
    const body = GenerateShoppingListBody.parse(req.body);
    const userId = req.user!.id;
    const [menu] = await db.select().from(weeklyMenusTable)
      .where(and(eq(weeklyMenusTable.id, body.menuId), eq(weeklyMenusTable.userId, userId)));
    if (!menu) { res.status(404).json({ error: "Menu not found" }); return; }

    const allRecipes = await db.select().from(recipesTable).where(eq(recipesTable.userId, userId));
    const recipeMap = new Map(allRecipes.map(r => [r.id, r]));

    const ingredientMap = new Map<string, Set<string>>();

    const days = menu.days as any[];
    for (const day of days) {
      const meals = [day.lunch?.primero, day.lunch?.segundo, day.dinner?.primero, day.dinner?.primero2, day.dinner?.segundo, day.dinner?.segundo2];
      for (const meal of meals) {
        if (!meal?.id) continue;
        const recipe = recipeMap.get(Number(meal.id));
        if (!recipe) continue;
        for (const ing of (recipe.ingredients ?? [])) {
          const normalized = ing.trim().toLowerCase();
          if (!normalized) continue;
          if (!ingredientMap.has(normalized)) ingredientMap.set(normalized, new Set());
          ingredientMap.get(normalized)!.add(recipe.name);
        }
      }
    }

    const items = Array.from(ingredientMap.entries()).map(([ingredient, recipes]) => ({
      ingredient: ingredient.charAt(0).toUpperCase() + ingredient.slice(1),
      recipes: Array.from(recipes),
      mercadonaProducts: [],
    }));

    res.json({
      menuId: body.menuId,
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error generating shopping list" });
  }
});

router.get("/shopping-list/:menuId", async (req: AuthenticatedRequest, res) => {
  try {
    const { menuId } = GetShoppingListParams.parse({ menuId: parseInt(req.params.menuId as string) });
    const userId = req.user!.id;
    const [menu] = await db.select().from(weeklyMenusTable)
      .where(and(eq(weeklyMenusTable.id, menuId), eq(weeklyMenusTable.userId, userId)));
    if (!menu) { res.status(404).json({ error: "Menu not found" }); return; }

    const allRecipes = await db.select().from(recipesTable).where(eq(recipesTable.userId, userId));
    const recipeMap = new Map(allRecipes.map(r => [r.id, r]));

    const ingredientMap = new Map<string, Set<string>>();

    const days = menu.days as any[];
    for (const day of days) {
      const meals = [day.lunch?.primero, day.lunch?.segundo, day.dinner?.primero, day.dinner?.primero2, day.dinner?.segundo, day.dinner?.segundo2];
      for (const meal of meals) {
        if (!meal?.id) continue;
        const recipe = recipeMap.get(Number(meal.id));
        if (!recipe) continue;
        for (const ing of (recipe.ingredients ?? [])) {
          const normalized = ing.trim().toLowerCase();
          if (!normalized) continue;
          if (!ingredientMap.has(normalized)) ingredientMap.set(normalized, new Set());
          ingredientMap.get(normalized)!.add(recipe.name);
        }
      }
    }

    const items = Array.from(ingredientMap.entries()).map(([ingredient, recipes]) => ({
      ingredient: ingredient.charAt(0).toUpperCase() + ingredient.slice(1),
      recipes: Array.from(recipes),
      mercadonaProducts: [],
    }));

    res.json({
      menuId,
      items,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Error fetching shopping list" });
  }
});

export default router;
