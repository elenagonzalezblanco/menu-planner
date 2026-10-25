import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCartPlan, matchIngredientToProduct, pairMenusWithOrders, quantityForDishes, searchQueryFor, tokenize, tokensMatch,
  usualQuantity, type MenuSnapshot, type PurchaseOrder, type RecipeInfo,
} from "./mercadona-planner";

const recipes: RecipeInfo[] = [
  { id: 1, name: "Pollo plancha", ingredients: ["Pechugas de pollo", "Aceite"] },
  { id: 2, name: "Salmorejo", ingredients: ["Tomates", "Pan", "Ajo", "Perejil"] },
  { id: 3, name: "Merluza al horno", ingredients: ["Merluza abierta sin espinas", "Limón"] },
  { id: 4, name: "Merluza frita", ingredients: ["Merluza en rodajas", "Harina"] },
  { id: 5, name: "Cogollos", ingredients: ["Cogollos", "Anchoas"] },
  { id: 6, name: "Gazpacho", ingredients: ["Tomate", "Pepino 1", "Ajos"] },
];

const line = (productId: string, name: string, quantity: number, category = "Fruta y verdura") =>
  ({ productId, name, quantity, category, unitPrice: "1.00", thumbnail: null });

const day = (offset: number) => new Date(Date.UTC(2026, 4, 1 + offset, 10)).toISOString();

/**
 * Six weeks: menu saved on day 7w, order delivered the next day. Merluza is on
 * the menu in weeks 0-3 (two different recipes) and bought in weeks 0-2.
 */
function history(): { pastMenus: MenuSnapshot[]; orders: PurchaseOrder[] } {
  const pastMenus: MenuSnapshot[] = [];
  const orders: PurchaseOrder[] = [];
  for (let week = 0; week < 6; week++) {
    const merluzaRecipe = week < 2 ? 3 : week < 4 ? 4 : 6;
    pastMenus.push({ savedAt: day(week * 7), recipeIds: [1, 2, merluzaRecipe] });
    const lines = [
      line("10", "Pechugas enteras familiar de pollo", week === 5 ? 3 : 2, "Carne"),
      line("11", "Atún claro en aceite de oliva Hacendado", 1, "Conservas"),
      line("12", "Aceite de oliva virgen extra Hacendado", 1, "Aceite"),
      line("20", "Rama de Tomates", 5),
      line("21", "Ajos morados", 1),
      line("22", "Limones", 2),
      line("40", "Leche entera Hacendado", 6, "Huevos, leche y mantequilla"),
      line("50", "Filetes de anchoa en aceite de oliva Hacendado", week === 0 ? 1 : 0, "Conservas"),
    ];
    if (week < 3) lines.push(line("30", "Porciones de merluza del Cabo", 3, "Marisco y pescado"));
    orders.push({ orderId: String(1000 + week), deliveredAt: day(week * 7 + 1), lines });
  }
  return { pastMenus, orders };
}

test("Spanish plurals, accents and container words do not break matching", () => {
  assert.ok(tokensMatch("limon", "limones"));
  assert.ok(tokensMatch("pechuga", "pechugas"));
  assert.ok(tokensMatch("ajo", "ajos"));
  assert.ok(!tokensMatch("sal", "salmon"));
  assert.ok(!tokensMatch("pan", "panceta"));
  assert.deepEqual(tokenize("Bolsa ensaladilla"), ["ensaladilla"]);
  assert.deepEqual(tokenize("200 g de Champiñones frescos"), ["champinones"]);
  assert.equal(searchQueryFor("200 g de champiñones (opcional)"), "champiñones");
  assert.equal(searchQueryFor("Hueso de jamón para el caldo"), "Hueso jamón caldo");
  assert.equal(matchIngredientToProduct(["aceite"], tokenize("Atún claro en aceite de oliva"))?.headPosition, 2);
  assert.equal(matchIngredientToProduct(["tomates"], tokenize("Rama de Tomates"))?.full, true);
});

test("quantity follows the dishes of the week, from what she bought per dish", () => {
  // Six fillets for one dish: two dishes need twelve.
  assert.equal(quantityForDishes([{ uses: 1, quantity: 6 }, { uses: 1, quantity: 6 }], 2, []), 12);
  // One bottle of oil covers several dishes.
  assert.equal(quantityForDishes([{ uses: 4, quantity: 1 }, { uses: 3, quantity: 1 }], 3, []), 1);
  // Never more than twice her largest purchase.
  assert.equal(quantityForDishes([{ uses: 1, quantity: 2 }], 5, []), 4);
  // Weight steps stay valid: 0.4 kg per dish, twice.
  assert.equal(quantityForDishes([{ uses: 1, quantity: 0.4 }], 2, []), 0.8);
  // No history with the dish: her usual purchase of that product.
  assert.equal(quantityForDishes([], 2, [3, 3, 1]), 3);
});

test("usual quantity is the median, clamped to what was bought and at least one unit", () => {
  assert.equal(usualQuantity([2, 2, 3]), 2);
  assert.equal(usualQuantity([1, 2]), 2);
  assert.equal(usualQuantity([]), 1);
  assert.equal(usualQuantity([0.4]), 0.4);
  assert.equal(usualQuantity([0.2, 0.4, 0.4, 0.6]), 0.4);
});

test("each order is paired with the latest revision of the menu saved before it", () => {
  const menus: MenuSnapshot[] = [
    { savedAt: day(0), recipeIds: [1] },
    { savedAt: day(1), recipeIds: [2] },
    { savedAt: day(20), recipeIds: [3] },
  ];
  const orders: PurchaseOrder[] = [
    { orderId: "1", deliveredAt: day(2), lines: [] },
    { orderId: "2", deliveredAt: day(4), lines: [] },
    { orderId: "3", deliveredAt: day(30), lines: [] },
  ];
  const pairs = pairMenusWithOrders(menus, orders);
  assert.deepEqual(pairs.map(pair => [pair.order.orderId, pair.menu.recipeIds[0]]), [["1", 2]]);
});

test("every ingredient of the menu goes to the cart with her usual product and quantity per dish", () => {
  const { pastMenus, orders } = history();
  // Pollo plancha twice this week.
  const plan = buildCartPlan({ menuRecipeIds: [1, 1, 2, 3, 4, 5, 6], recipes, pastMenus, orders });
  const byName = new Map(plan.items.map(item => [item.productName ?? `?${item.searchQuery}`, item]));

  assert.equal(plan.stats.weeksPaired, 6);
  // Two chicken dishes: twice the two trays she buys per dish.
  const chicken = byName.get("Pechugas enteras familiar de pollo")!;
  assert.equal(chicken.quantity, 4);
  assert.equal(chicken.confidence, "alta");
  assert.match(chicken.reason, /^Para 2 platos \(Pollo plancha\)/);
  // "Aceite" is the oil, not tinned tuna in oil.
  assert.ok(byName.has("Aceite de oliva virgen extra Hacendado"));
  assert.ok(!byName.has("Atún claro en aceite de oliva Hacendado"));
  // Singular/plural ingredients and both merluza recipes collapse to one product.
  assert.deepEqual(byName.get("Ajos morados")?.ingredients, ["Ajo", "Ajos"]);
  assert.deepEqual(byName.get("Rama de Tomates")?.ingredients, ["Tomates", "Tomate"]);
  const merluza = byName.get("Porciones de merluza del Cabo")!;
  assert.deepEqual(merluza.ingredients.sort(), ["Merluza abierta sin espinas", "Merluza en rodajas"]);
  assert.equal(merluza.quantity, 6);
  // Nothing on the menu is left out: never bought means it is searched in the shop.
  assert.equal(byName.get("?Perejil")?.source, "busqueda");
  assert.equal(byName.get("?Pan")?.quantity, 1);
  assert.equal(byName.get("?Cogollos")?.source, "busqueda");
  // Bought once, never with this dish: still added, with low confidence.
  assert.equal(byName.get("Filetes de anchoa en aceite de oliva Hacendado")?.confidence, "baja");
  // Only menu ingredients: milk is bought every week but no dish needs it.
  assert.ok(!byName.has("Leche entera Hacendado"));
  assert.ok(plan.purchasedProductIds.includes("10"));
});

test("without history every ingredient is searched in the shop", () => {
  const plan = buildCartPlan({ menuRecipeIds: [6], recipes, pastMenus: [], orders: [] });
  assert.deepEqual(plan.items.map(item => item.searchQuery), ["Tomate", "Pepino", "Ajos"]);
  assert.ok(plan.items.every(item => item.source === "busqueda" && item.quantity === 1));
});
