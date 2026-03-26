import { Router, type IRouter } from "express";
import { db, recipesTable, weeklyMenusTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import OpenAI from "openai";
import { GenerateMenuBody, GetMenuParams } from "@workspace/api-zod";

const router: IRouter = Router();

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

const DAYS_ES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// ── Historical preferences learned from the user's 5-week calendar ──
const HISTORICAL_CONTEXT = `
=== HISTORIAL Y PREFERENCIAS PERSONALES DE LA USUARIA ===

COMBINACIONES HABITUALES (primero → segundo en cenas):
- Crema de zanahoria → Pollo de la abuela
- Vichyssoise → Merluza al horno con ajos (a veces también Judías verdes con jamón)
- Sopa de calabacín → Merluza frita rebozada o Dorada o lubina a la sal
- Sopa de cebolla → Rape o Pollo de la abuela o pescado
- Gazpacho → plato ligero (Albóndigas, Pollo empanado...) o solo
- Salmorejo → solo o antes de algo ligero

PLATOS QUE APARECEN PRÁCTICAMENTE CADA SEMANA (rotar con frecuencia):
- Arroz blanco con tomate y jamón York
- Gazpacho o Salmorejo
- Albóndigas
- Judías verdes con jamón
- Setas a la plancha
- Pechugas de pollo empanadas
- Espaguetis
- Ensalada murciana

PATRONES POR DÍA DE LA SEMANA (solo aplicar si el usuario NO dice lo contrario):
- Jueves: suele poner Pastel de sandwich (Sandwich en las recetas) o algo sencillo
- Viernes: habitualmente más platos, se cocina más cantidad
- Lunes: platos sencillos (Crema/sopa + algo)

PLATOS QUE USA MENOS (solo 1-2 veces en 5 semanas):
- Pulpo a la gallega, Salmón, Bacalao con tomate, Atún con tomate, Rape, Lasaña, Lentejas

EQUILIBRIO GENERAL:
- Alterna carne y pescado a lo largo de la semana
- Las sopas/cremas frías (Gazpacho, Salmorejo, Vichyssoise) van en cenas, especialmente en semanas con más calor
- Mezcla platos más elaborados con otros rápidos
- Los "otros" (Espaguetis, Croquetas, Tortilla, Huevos...) suelen ser segundos rápidos para cenas ligeras

=== FIN HISTORIAL ===
`.trim();

// ── Fish/seafood recipe detection ──
const FISH_KEYWORDS = ["merluza", "salmón", "salmon", "bacalao", "rape", "dorada", "lubina", "calamares", "boquerones", "gallos", "pulpo", "atún", "atun", "gambas", "ajetes y gambas", "revuelto de ajetes"];

function isFishRecipe(name: string | undefined | null): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return FISH_KEYWORDS.some(k => lower.includes(k));
}

// ── Parse structural constraints from user text ──
function parseConstraints(text: string) {
  const t = text.toLowerCase();

  // No primero at lunch
  const noLunchPrimero =
    /solo segundo[s]?\s*(en\s*(la\s*)?comida|a\s*medio[dí]a|al\s*medio[dí]a)/.test(t) ||
    /(sin|no|nada\s*de)\s*primero\s*(en\s*(la\s*)?comida|a\s*medio[dí]a)/.test(t) ||
    /(comida|medio[dí]a)\s*(sin|no|nada\s*de)\s*primero/.test(t) ||
    /comida\s*solo\s*segundo[s]?/.test(t);

  // No primero at dinner
  const noDinnerPrimero =
    /solo segundo[s]?\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(sin|no|nada\s*de)\s*primero\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(cena)\s*(sin|no|nada\s*de)\s*primero/.test(t);

  // No primero anywhere
  const noAnywhere =
    /\bsolo segundo[s]?\b/.test(t) &&
    !/(comida|cena|medio[dí]a|almuerzo)/.test(t);

  // No fish at lunch ("solo carne a mediodía", "sin pescado en la comida")
  const noFishAtLunch =
    /(solo|s[oó]lo)\s*(carne|proteína|proteina)\s*(a\s*medio[dí]a|en\s*(la\s*)?comida|al\s*medio[dí]a)/.test(t) ||
    /(sin|no|nada\s*de)\s*(pescado|marisco)\s*(a\s*medio[dí]a|en\s*(la\s*)?comida)/.test(t) ||
    /(comida|medio[dí]a)\s*(sin|no)\s*(pescado|marisco)/.test(t) ||
    /(quiero|pon|poner)\s*solo\s*carne\s*(a\s*medio[dí]a|en\s*(la\s*)?comida)/.test(t);

  // No fish at dinner
  const noFishAtDinner =
    /(solo|s[oó]lo)\s*(carne)\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(sin|no|nada\s*de)\s*(pescado|marisco)\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(cena)\s*(sin|no)\s*(pescado|marisco)/.test(t);

  return { noLunchPrimero, noDinnerPrimero, noAnywhere, noFishAtLunch, noFishAtDinner };
}

type DayMenu = {
  day: string;
  lunch: { primero: { id: number; name: string } | null; segundo: { id: number; name: string } | null };
  dinner: { primero: { id: number; name: string } | null; segundo: { id: number; name: string } | null };
};

function enforceConstraints(
  days: DayMenu[],
  c: ReturnType<typeof parseConstraints>
): DayMenu[] {
  return days.map((day) => {
    let lunch = day.lunch;
    let dinner = day.dinner;

    // No primero at lunch
    if ((c.noLunchPrimero || c.noAnywhere) && lunch) {
      lunch = { ...lunch, primero: null };
    }
    // No primero at dinner
    if ((c.noDinnerPrimero || c.noAnywhere) && dinner) {
      dinner = { ...dinner, primero: null };
    }
    // No fish at lunch — remove fish recipes from lunch.segundo
    if (c.noFishAtLunch && lunch?.segundo && isFishRecipe(lunch.segundo.name)) {
      lunch = { ...lunch, segundo: null };
    }
    // No fish at dinner — remove fish recipes from dinner.segundo
    if (c.noFishAtDinner && dinner?.segundo && isFishRecipe(dinner.segundo.name)) {
      dinner = { ...dinner, segundo: null };
    }

    return { ...day, lunch, dinner };
  });
}

// ── Build a readable summary of active constraints for the system prompt ──
function buildConstraintSummary(c: ReturnType<typeof parseConstraints>): string {
  const lines: string[] = [];
  if (c.noLunchPrimero || c.noAnywhere) lines.push("• lunch.primero = null en TODOS los días (sin primero en la comida)");
  if (c.noDinnerPrimero || c.noAnywhere) lines.push("• dinner.primero = null en TODOS los días (sin primero en la cena)");
  if (c.noFishAtLunch) lines.push("• NO poner pescado/marisco en lunch.segundo en ningún día (solo carne)");
  if (c.noFishAtDinner) lines.push("• NO poner pescado/marisco en dinner.segundo en ningún día (solo carne)");
  return lines.length ? lines.join("\n") : "Ninguna restricción especial activa.";
}


router.post("/menus/generate", async (req, res) => {
  try {
    const body = GenerateMenuBody.parse(req.body);
    const daysCount = body.daysCount ?? 7;
    const preferences = body.preferences ?? "";
    const excludeIds = body.excludeRecipes ?? [];

    const allRecipes = await db.select().from(recipesTable);
    const available = allRecipes.filter(r => !excludeIds.includes(r.id));
    const recipeList = available.map(r => `[${r.id}] ${r.name} (${r.category})`).join("\n");

    const constraints = parseConstraints(preferences);
    const constraintSummary = buildConstraintSummary(constraints);

    const systemPrompt = `Eres el chef personal de una familia española que conoce bien sus gustos.
Responde SOLO con JSON válido, sin texto adicional ni markdown.`;

    const userPrompt = [
      preferences
        ? `=== INSTRUCCIONES ESPECÍFICAS ESTA SEMANA (PRIORIDAD ABSOLUTA — ANULAN cualquier historial) ===\n${preferences}\n\nRESTRICCIONES ESTRUCTURALES DETECTADAS (aplícalas sin excepción):\n${constraintSummary}\n=== FIN INSTRUCCIONES ===`
        : "",
      "",
      HISTORICAL_CONTEXT,
      "",
      `Mis recetas disponibles:\n${recipeList}`,
      "",
      `Crea el menú para: ${DAYS_ES.slice(0, daysCount).join(", ")}.`,
      "",
      "Reglas:",
      "- Primeros: categoría \"primero\"",
      "- Segundos: categoría \"segundo\" o \"otro\"",
      "- No repetir la misma receta más de una vez en la semana",
      "- Usar SOLO los IDs de las recetas listadas",
      "- \"primero\" puede ser null si el usuario lo pide",
      "",
      preferences ? `RECORDATORIO FINAL: "${preferences}". Cumple esto sin excepciones.` : "",
      "",
      `Formato JSON requerido:
{
  "days": [
    {
      "day": "Lunes",
      "lunch": { "primero": {"id": 1, "name": "Nombre"}, "segundo": {"id": 2, "name": "Nombre"} },
      "dinner": { "primero": null, "segundo": {"id": 3, "name": "Nombre"} }
    }
  ]
}`,
    ]
      .filter(l => l !== null)
      .join("\n");

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    let menuData = JSON.parse(completion.choices[0].message.content ?? "{}");

    // Enforce constraints programmatically (foolproof — the AI might make mistakes)
    if (menuData.days && Array.isArray(menuData.days)) {
      menuData.days = enforceConstraints(menuData.days, constraints);
    }

    const [saved] = await db.insert(weeklyMenusTable).values({
      days: menuData.days ?? [],
    }).returning();

    const enriched = await enrichMenuWithRecipes(saved, available);
    res.json(enriched);
  } catch (err) {
    console.error("Menu generation error:", err);
    res.status(500).json({ error: "Error generating menu: " + String(err) });
  }
});

router.get("/menus", async (_req, res) => {
  try {
    const allRecipes = await db.select().from(recipesTable);
    const menus = await db.select().from(weeklyMenusTable).orderBy(weeklyMenusTable.createdAt);
    const enriched = await Promise.all(menus.map(m => enrichMenuWithRecipes(m, allRecipes)));
    res.json(enriched.reverse());
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/menus/:id", async (req, res) => {
  try {
    const { id } = GetMenuParams.parse(req.params);
    const [menu] = await db.select().from(weeklyMenusTable).where(eq(weeklyMenusTable.id, id));
    if (!menu) return res.status(404).json({ error: "Menu not found" });
    const allRecipes = await db.select().from(recipesTable);
    const enriched = await enrichMenuWithRecipes(menu, allRecipes);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.patch("/menus/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const { days } = req.body;
    const [updated] = await db
      .update(weeklyMenusTable)
      .set({ days })
      .where(eq(weeklyMenusTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Menu not found" });
    const allRecipes = await db.select().from(recipesTable);
    const enriched = await enrichMenuWithRecipes(updated, allRecipes);
    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/menus/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
    const [deleted] = await db
      .delete(weeklyMenusTable)
      .where(eq(weeklyMenusTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Menu not found" });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.delete("/menus", async (_req, res) => {
  try {
    await db.delete(weeklyMenusTable);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ── Chat / Agent endpoint ──
router.post("/menus/chat", async (req, res) => {
  try {
    const { message, history = [], menuId } = req.body as {
      message: string;
      history: { role: "user" | "assistant"; content: string }[];
      menuId?: number;
    };

    if (!message?.trim()) return res.status(400).json({ error: "Message required" });

    const allRecipes = await db.select().from(recipesTable);
    const recipeList = allRecipes.map(r => `[ID:${r.id}] ${r.name} (${r.category})`).join("\n");

    // Get current menu if provided
    let currentMenu: any = null;
    if (menuId) {
      const [menu] = await db.select().from(weeklyMenusTable).where(eq(weeklyMenusTable.id, menuId));
      if (menu) currentMenu = await enrichMenuWithRecipes(menu, allRecipes);
    }

    // Build human-readable current menu for context
    const menuContext = currentMenu
      ? currentMenu.days.map((d: any) => {
          const lp = d.lunch?.primero?.name ?? "—";
          const ls = d.lunch?.segundo?.name ?? "—";
          const dp = d.dinner?.primero?.name ?? "—";
          const ds = d.dinner?.segundo?.name ?? "—";
          return `  ${d.day}: Comida=[${lp} | ${ls}]  Cena=[${dp} | ${ds}]`;
        }).join("\n")
      : "  (ningún menú todavía)";

    // Accumulate constraints from ENTIRE conversation (all history + current message)
    const fullConversation = history.map((h: any) => h.content).join(" ") + " " + message;
    const constraints = parseConstraints(fullConversation);
    const constraintSummary = buildConstraintSummary(constraints);

    const systemPrompt = `Eres Elena, asistente de planificación de menús semanales de una familia española.
Respondes siempre en JSON válido sin markdown, sin texto extra fuera del JSON.

════════════════════════════════
MENÚ ACTUAL (los 7 días):
${menuContext}

════════════════════════════════
RESTRICCIONES ACTIVAS (OBLIGATORIO cumplirlas en TODOS los días sin excepción):
${constraintSummary}

════════════════════════════════
RECETAS DISPONIBLES (usa SOLO estos IDs):
${recipeList}

════════════════════════════════
${HISTORICAL_CONTEXT}

════════════════════════════════
INSTRUCCIONES CRÍTICAS:
1. Si el usuario pide generar o crear → crea 7 días completos
2. Si el usuario pide cambiar algo → cambia SOLO lo pedido; el resto copialo EXACTAMENTE del MENÚ ACTUAL
3. SIEMPRE devuelve los 7 días en updatedDays cuando hagas cualquier cambio (ni más ni menos)
4. Los días sin cambio deben copiarse tal cual están en el MENÚ ACTUAL arriba
5. "primero" puede ser null — es válido y correcto cuando no hay primero
6. No repitas la misma receta más de una vez en la semana
7. Las RESTRICCIONES ACTIVAS NO pueden violarse jamás, ni aunque el historial las contradiga

FORMATO DE RESPUESTA (JSON, sin markdown):
{
  "reply": "Texto breve (1-2 frases) explicando qué has hecho o respondiendo la pregunta.",
  "updatedDays": null
}

Cuando hay cambios:
{
  "reply": "He cambiado el martes: Albóndigas de segundo en la comida.",
  "updatedDays": [
    { "day": "Lunes",   "lunch": { "primero": {"id": 5, "name": "Sopa de cebolla"}, "segundo": {"id": 2, "name": "Pollo de la abuela"} }, "dinner": { "primero": null, "segundo": {"id": 12, "name": "Tortilla de patatas"} } },
    { "day": "Martes",  "lunch": { "primero": null, "segundo": {"id": 8, "name": "Albóndigas"} }, "dinner": { "primero": {"id": 3, "name": "Gazpacho"}, "segundo": {"id": 7, "name": "Pechuga empanada"} } },
    ... (los 7 días completos)
  ]
}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
    });

    const raw = JSON.parse(completion.choices[0].message.content ?? "{}");
    const reply: string = raw.reply ?? "Hecho.";
    let updatedMenu = null;

    if (raw.updatedDays && Array.isArray(raw.updatedDays) && raw.updatedDays.length > 0) {
      // Start with the AI's returned days
      let days: DayMenu[] = raw.updatedDays;

      // If the AI returned fewer than 7 days, MERGE with existing menu
      // (never lose days that the AI didn't touch)
      if (currentMenu && days.length < 7) {
        const returnedByDay = new Map(days.map((d: DayMenu) => [d.day, d]));
        days = currentMenu.days.map((existing: DayMenu) =>
          returnedByDay.has(existing.day) ? returnedByDay.get(existing.day)! : existing
        );
      }

      // Programmatically enforce accumulated constraints (fish/primero rules)
      days = enforceConstraints(days, constraints);

      if (menuId) {
        const [updated] = await db
          .update(weeklyMenusTable)
          .set({ days })
          .where(eq(weeklyMenusTable.id, menuId))
          .returning();
        if (updated) updatedMenu = await enrichMenuWithRecipes(updated, allRecipes);
      } else {
        const [created] = await db.insert(weeklyMenusTable).values({ days }).returning();
        updatedMenu = await enrichMenuWithRecipes(created, allRecipes);
      }
    }

    res.json({ reply, updatedMenu });
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Error del agente: " + String(err) });
  }
});

async function enrichMenuWithRecipes(menu: any, allRecipes: any[]) {
  const recipeMap = Object.fromEntries(allRecipes.map(r => [r.id, r]));

  function resolveRecipe(slot: any) {
    if (!slot) return null;
    const recipe = recipeMap[slot.id];
    if (!recipe) return slot;
    return { id: recipe.id, name: recipe.name, category: recipe.category };
  }

  const days = (menu.days ?? []).map((day: any) => ({
    ...day,
    lunch: day.lunch
      ? { primero: resolveRecipe(day.lunch.primero), segundo: resolveRecipe(day.lunch.segundo) }
      : null,
    dinner: day.dinner
      ? { primero: resolveRecipe(day.dinner.primero), segundo: resolveRecipe(day.dinner.segundo) }
      : null,
  }));

  return { ...menu, days };
}

export default router;
