import { Router, type IRouter } from "express";
import { db, recipesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListRecipesQueryParams,
  CreateRecipeBody,
  GetRecipeParams,
  UpdateRecipeParams,
  UpdateRecipeBody,
  DeleteRecipeParams,
} from "@workspace/api-zod";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/recipes", async (req: AuthenticatedRequest, res) => {
  try {
    const query = ListRecipesQueryParams.parse(req.query);
    const userId = req.user!.id;
    let recipes;
    if (query.category) {
      recipes = await db.select().from(recipesTable)
        .where(and(eq(recipesTable.userId, userId), eq(recipesTable.category, query.category)));
    } else {
      recipes = await db.select().from(recipesTable)
        .where(eq(recipesTable.userId, userId))
        .orderBy(recipesTable.name);
    }
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: "Error fetching recipes" });
  }
});

router.post("/recipes", async (req: AuthenticatedRequest, res) => {
  try {
    const body = CreateRecipeBody.parse(req.body);
    const [recipe] = await db.insert(recipesTable).values({
      userId: req.user!.id,
      name: body.name,
      category: body.category,
      ingredients: body.ingredients,
      instructions: body.instructions ?? "",
    }).returning();
    res.status(201).json(recipe);
  } catch (err) {
    res.status(400).json({ error: "Invalid recipe data" });
  }
});

router.get("/recipes/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = GetRecipeParams.parse({ id: parseInt(req.params.id as string) });
    const [recipe] = await db.select().from(recipesTable)
      .where(and(eq(recipesTable.id, id), eq(recipesTable.userId, req.user!.id)));
    if (!recipe) { res.status(404).json({ error: "Recipe not found" }); return; }
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: "Error fetching recipe" });
  }
});

router.put("/recipes/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = UpdateRecipeParams.parse({ id: parseInt(req.params.id as string) });
    const body = UpdateRecipeBody.parse(req.body);
    const [recipe] = await db.update(recipesTable)
      .set({ name: body.name, category: body.category, ingredients: body.ingredients, instructions: body.instructions ?? "" })
      .where(and(eq(recipesTable.id, id), eq(recipesTable.userId, req.user!.id)))
      .returning();
    if (!recipe) { res.status(404).json({ error: "Recipe not found" }); return; }
    res.json(recipe);
  } catch (err) {
    res.status(400).json({ error: "Invalid recipe data" });
  }
});

router.delete("/recipes/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const { id } = DeleteRecipeParams.parse({ id: parseInt(req.params.id as string) });
    await db.delete(recipesTable)
      .where(and(eq(recipesTable.id, id), eq(recipesTable.userId, req.user!.id)));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Error deleting recipe" });
  }
});

export default router;
