import { Router, type IRouter } from "express";
import { CANONICAL_RECIPES } from "../lib/canonical-recipes";

const router: IRouter = Router();

/**
 * Public recipe catalogue — no authentication required. Serves the canonical
 * recipe set (name, category, ingredients, instructions) so the standalone
 * /recetas page can list and search recipes before any user logs in.
 */
router.get("/public/recipes", (_req, res) => {
  const recipes = [...CANONICAL_RECIPES].sort((a, b) =>
    a.name.localeCompare(b.name, "es"),
  );
  res.set("Cache-Control", "public, max-age=300");
  res.json(recipes);
});

export default router;
