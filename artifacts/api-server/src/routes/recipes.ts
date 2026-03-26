import { Router, type IRouter } from "express";
import { db, recipesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  ListRecipesQueryParams,
  CreateRecipeBody,
  GetRecipeParams,
  UpdateRecipeParams,
  UpdateRecipeBody,
  DeleteRecipeParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/recipes", async (req, res) => {
  try {
    const query = ListRecipesQueryParams.parse(req.query);
    let recipes;
    if (query.category) {
      recipes = await db.select().from(recipesTable).where(eq(recipesTable.category, query.category));
    } else {
      recipes = await db.select().from(recipesTable).orderBy(recipesTable.name);
    }
    res.json(recipes);
  } catch (err) {
    res.status(500).json({ error: "Error fetching recipes" });
  }
});

router.post("/recipes", async (req, res) => {
  try {
    const body = CreateRecipeBody.parse(req.body);
    const [recipe] = await db.insert(recipesTable).values({
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

router.get("/recipes/:id", async (req, res) => {
  try {
    const { id } = GetRecipeParams.parse({ id: parseInt(req.params.id) });
    const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, id));
    if (!recipe) return res.status(404).json({ error: "Recipe not found" });
    res.json(recipe);
  } catch (err) {
    res.status(500).json({ error: "Error fetching recipe" });
  }
});

router.put("/recipes/:id", async (req, res) => {
  try {
    const { id } = UpdateRecipeParams.parse({ id: parseInt(req.params.id) });
    const body = UpdateRecipeBody.parse(req.body);
    const [recipe] = await db.update(recipesTable)
      .set({ name: body.name, category: body.category, ingredients: body.ingredients, instructions: body.instructions ?? "" })
      .where(eq(recipesTable.id, id))
      .returning();
    if (!recipe) return res.status(404).json({ error: "Recipe not found" });
    res.json(recipe);
  } catch (err) {
    res.status(400).json({ error: "Invalid recipe data" });
  }
});

router.delete("/recipes/:id", async (req, res) => {
  try {
    const { id } = DeleteRecipeParams.parse({ id: parseInt(req.params.id) });
    await db.delete(recipesTable).where(eq(recipesTable.id, id));
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: "Error deleting recipe" });
  }
});

export default router;
