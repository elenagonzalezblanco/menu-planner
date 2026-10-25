/**
 * Builds a Mercadona cart with every ingredient of the weekly menu. The user's
 * own purchase history only decides which product she buys for each ingredient
 * and how much per dish, learned by pairing each past weekly menu with the order
 * delivered right after it. Pure and deterministic so it can be unit-tested.
 */

export interface PurchaseLine {
  productId: string;
  name: string;
  quantity: number;
  category?: string | null;
  unitPrice?: string | null;
  thumbnail?: string | null;
}

export interface PurchaseOrder {
  orderId: string;
  deliveredAt: string;
  lines: PurchaseLine[];
}

export interface MenuSnapshot {
  savedAt: string;
  recipeIds: number[];
}

export interface RecipeInfo {
  id: number;
  name: string;
  ingredients: string[];
}

export type PlanConfidence = "alta" | "media" | "baja";

export interface PlanItem {
  key: string;
  ingredients: string[];
  recipes: string[];
  productId: string | null;
  productName: string | null;
  searchQuery: string | null;
  quantity: number;
  category: string | null;
  unitPrice: string | null;
  thumbnail: string | null;
  source: "historial" | "busqueda";
  confidence: PlanConfidence;
  reason: string;
}

export interface CartPlan {
  items: PlanItem[];
  /** Everything she has bought, most frequent first: a search prefers products she already knows. */
  purchasedProductIds: string[];
  stats: {
    ordersAnalyzed: number;
    weeksPaired: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
}

export interface BuildCartPlanInput {
  menuRecipeIds: number[];
  recipes: RecipeInfo[];
  pastMenus: MenuSnapshot[];
  orders: PurchaseOrder[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A menu is paired with the first order delivered up to this many days after it was saved. */
export const PAIRING_WINDOW_DAYS = 5;
/** Below this purchase rate (with enough evidence) the item is flagged as "check if you already have it". */
export const MIN_PURCHASE_RATE = 0.3;
/** Weeks of evidence needed before trusting a "she rarely buys this" signal. */
export const MIN_EVIDENCE_WEEKS = 3;
/** A partial name match is accepted for products bought in at least this share of orders. */
export const HABITUAL_PARTIAL_SHARE = 0.4;

const STOPWORDS = new Set([
  "de", "del", "con", "en", "la", "el", "los", "las", "al", "y", "e", "para", "tipo", "o", "u", "a",
  "un", "una", "unos", "unas", "g", "gr", "kg", "ml", "l", "cl", "ud", "uds", "bote", "trozo", "medio",
  "media", "hoja", "hojas", "chorrito", "sobre", "opcional", "fresco", "fresca", "frescos", "frescas",
  "dedo", "gordo", "cortado", "cortada", "sin", "por", "su", "sus", "lo", "le", "mas", "poco", "pizca",
  "bolsa", "bolsas", "paquete", "paquetes", "lata", "latas", "tarro", "tarros", "bandeja", "botella", "brick",
]);

/** Ingredient words that Mercadona names differently. */
const SYNONYMS: Record<string, string[]> = {
  york: ["cocido"],
  bimbo: ["molde"],
  philadelphia: ["untar"],
  ideal: ["evaporada"],
  maizena: ["maiz"],
  tomatitos: ["tomates", "cherry"],
  tomatito: ["tomate", "cherry"],
  bacon: ["beicon"],
  beicon: ["bacon"],
};

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter(token => token.length > 0 && !STOPWORDS.has(token) && !/^\d/.test(token));
}

/** Equality tolerant to Spanish plurals ("limón"/"limones", "pechuga"/"pechugas"). */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long === `${short}s` || long === `${short}es`) return true;
  return short.length >= 5 && long.startsWith(short) && long.length - short.length <= 2;
}

function tokenMatchesAny(token: string, candidates: string[]): boolean {
  const alternatives = [token, ...(SYNONYMS[token] ?? [])];
  return candidates.some(candidate => alternatives.some(alternative => tokensMatch(alternative, candidate)));
}

export interface NameMatch {
  full: boolean;
  score: number;
  /** Index of the ingredient's first word in the product name. */
  headPosition: number;
}

/** Product names lead with the food ("Rama de tomates"); brands usually come last ("… Nutella"). */
const HEAD_WINDOW = 2;

export function matchIngredientToProduct(ingredientTokens: string[], productTokens: string[]): NameMatch | null {
  if (ingredientTokens.length === 0 || productTokens.length === 0) return null;
  const headPosition = productTokens.findIndex(productToken => tokenMatchesAny(ingredientTokens[0], [productToken]));
  if (headPosition < 0) return null;
  const matched = ingredientTokens.filter(token => tokenMatchesAny(token, productTokens)).length;
  return { full: matched === ingredientTokens.length, score: matched / ingredientTokens.length, headPosition };
}

/** Keeps the meaningful words for a supermarket search ("200 g de champiñones (opcional)" → "champiñones"). */
export function searchQueryFor(label: string): string {
  const words = label
    .replace(/\([^)]*\)/g, " ")
    .split(/\s+/)
    .filter(word => {
      const normalized = normalizeText(word);
      return normalized.length > 0 && !STOPWORDS.has(normalized) && !/^\d/.test(normalized);
    });
  return words.length > 0 ? words.join(" ") : label.trim();
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, index) => tokensMatch(token, b[index]));
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Units: median rounded half up, never below one. Products sold by weight
 * (fractional kg) keep a quantity she actually bought, so it stays a valid step.
 */
export function usualQuantity(quantities: number[]): number {
  if (quantities.length === 0) return 1;
  if (quantities.some(quantity => !Number.isInteger(quantity))) {
    const sorted = [...quantities].sort((x, y) => x - y);
    return sorted[Math.floor((sorted.length - 1) / 2)];
  }
  return Math.max(1, Math.floor(median(quantities) + 0.5));
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

export interface QuantitySample {
  /** Dishes of that week's menu that used the ingredient. */
  uses: number;
  /** Units (or kg) bought in the order that followed. */
  quantity: number;
}

/**
 * Quantity for this week's dishes: what she bought per dish in past weeks,
 * times the dishes that use it now. Capped at twice her largest purchase so a
 * pantry item that appears in many dishes is not multiplied absurdly.
 */
export function quantityForDishes(samples: QuantitySample[], dishes: number, fallback: number[]): number {
  if (samples.length === 0 || dishes <= 0) return usualQuantity(fallback);
  const quantities = samples.map(sample => sample.quantity);
  const cap = 2 * Math.max(...quantities);
  if (quantities.some(quantity => !Number.isInteger(quantity))) {
    const typicalDishes = Math.max(1, median(samples.map(sample => sample.uses)));
    const multiplier = Math.max(1, Math.round(dishes / typicalDishes));
    return round3(Math.min(cap, usualQuantity(quantities) * multiplier));
  }
  const perDish = median(samples.map(sample => sample.quantity / Math.max(sample.uses, 1)));
  return Math.min(cap, Math.max(1, Math.floor(perDish * dishes + 0.5)));
}

interface IngredientGroup {
  key: string;
  tokens: string[];
  labels: string[];
  recipes: string[];
  /** Positions of this week's dishes that use the ingredient. */
  dishes: Set<number>;
}

class IngredientIndex {
  readonly groups: IngredientGroup[] = [];

  add(label: string, recipe: string, dish: number): void {
    const tokens = tokenize(label);
    if (tokens.length === 0) return;
    let group = this.groups.find(existing => sameTokens(existing.tokens, tokens));
    if (!group) {
      group = { key: tokens.join(" "), tokens, labels: [], recipes: [], dishes: new Set() };
      this.groups.push(group);
    }
    const trimmed = label.trim();
    if (!group.labels.some(existing => normalizeText(existing) === normalizeText(trimmed))) group.labels.push(trimmed);
    if (!group.recipes.includes(recipe)) group.recipes.push(recipe);
    group.dishes.add(dish);
  }

  find(tokens: string[]): IngredientGroup | undefined {
    return this.groups.find(group => sameTokens(group.tokens, tokens));
  }
}

interface ProductStats {
  productId: string;
  name: string;
  tokens: string[];
  category: string | null;
  unitPrice: string | null;
  thumbnail: string | null;
  orderCount: number;
  quantities: number[];
}

interface PairedWeek {
  /** Ingredient key → dishes of that week's menu using it. */
  ingredientUses: Map<string, number>;
  /** First word of every ingredient, once per dish. */
  dishHeads: string[][];
  purchases: Map<string, number>;
}

function recipeIngredientTokens(recipe: RecipeInfo): string[][] {
  const seen: string[][] = [];
  for (const ingredient of recipe.ingredients) {
    const tokens = tokenize(ingredient);
    if (tokens.length > 0 && !seen.some(existing => sameTokens(existing, tokens))) seen.push(tokens);
  }
  return seen;
}

function orderPurchases(order: PurchaseOrder): Map<string, number> {
  const purchases = new Map<string, number>();
  for (const line of order.lines) {
    if (!line.productId || !(line.quantity > 0)) continue;
    purchases.set(line.productId, round3((purchases.get(line.productId) ?? 0) + line.quantity));
  }
  return purchases;
}

/** Pairs every past menu with the first order delivered within the window after it was saved. */
export function pairMenusWithOrders(pastMenus: MenuSnapshot[], orders: PurchaseOrder[]): Array<{ menu: MenuSnapshot; order: PurchaseOrder }> {
  const sortedOrders = [...orders].sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt));
  const usedMenus = new Set<MenuSnapshot>();
  const pairs: Array<{ menu: MenuSnapshot; order: PurchaseOrder }> = [];
  for (const order of sortedOrders) {
    const deliveredAt = Date.parse(order.deliveredAt);
    if (Number.isNaN(deliveredAt)) continue;
    let best: MenuSnapshot | null = null;
    for (const menu of pastMenus) {
      const savedAt = Date.parse(menu.savedAt);
      if (Number.isNaN(savedAt) || usedMenus.has(menu)) continue;
      const gap = deliveredAt - savedAt;
      if (gap < 0 || gap > PAIRING_WINDOW_DAYS * DAY_MS) continue;
      if (!best || savedAt > Date.parse(best.savedAt)) best = menu;
    }
    if (!best) continue;
    // Revisions of the same week's menu are superseded by the chosen (latest) one.
    for (const menu of pastMenus) {
      const savedAt = Date.parse(menu.savedAt);
      if (!Number.isNaN(savedAt) && savedAt <= Date.parse(best.savedAt) && deliveredAt - savedAt <= PAIRING_WINDOW_DAYS * DAY_MS) usedMenus.add(menu);
    }
    pairs.push({ menu: best, order });
  }
  return pairs;
}

interface Candidate {
  stats: ProductStats;
  match: NameMatch;
  /** Past weeks with this ingredient on the menu in which the product was bought. */
  samples: QuantitySample[];
}

interface ProductChoice extends Candidate {
  evidenceWeeks: number;
  basis: "ingrediente" | "familia" | "habitual";
}

const byPreference = (a: Candidate, b: Candidate) =>
  b.samples.length - a.samples.length || b.stats.orderCount - a.stats.orderCount || a.stats.name.length - b.stats.name.length;

/**
 * Tiers, from strongest to weakest evidence: same name; partial name that
 * follows the menu; any product of the same family ("merluza …") bought when
 * that family is on the menu; partial name of an almost-weekly product; brand
 * named at the end of the product ("Nutella").
 */
function chooseProduct(
  group: IngredientGroup, candidates: Candidate[], evidenceWeeks: number, weeks: PairedWeek[], orderTotal: number,
  claimedByName: Set<string>,
): ProductChoice | null {
  const share = (candidate: Candidate) => candidate.stats.orderCount / Math.max(orderTotal, 1);
  const allNear = candidates.filter(candidate => candidate.match.headPosition < HEAD_WINDOW);
  const ingredientChoice = (candidate: Candidate | undefined, basis: ProductChoice["basis"]): ProductChoice | null =>
    candidate ? { ...candidate, evidenceWeeks, basis } : null;

  const full = allNear.filter(candidate => candidate.match.full).sort(byPreference)[0];
  if (full) return ingredientChoice(full, "ingrediente");
  // "Jamón serrano" must not become the "Jamón cocido" another ingredient ("Jamón York") already names.
  const near = allNear.filter(candidate => !claimedByName.has(candidate.stats.productId));

  const learned = near
    .filter(candidate => candidate.match.score >= 0.5 && candidate.samples.length >= 2)
    .filter(candidate => candidate.samples.length / evidenceWeeks >= 1.3 * share(candidate))
    .sort(byPreference)[0];
  if (learned) return ingredientChoice(learned, "ingrediente");

  const familyUses = (week: PairedWeek) =>
    week.dishHeads.filter(heads => heads.some(head => tokensMatch(head, group.tokens[0]))).length;
  const familyWeeks = weeks.filter(week => familyUses(week) > 0);
  const familyWithSamples = near.map(candidate => ({
    ...candidate,
    samples: familyWeeks
      .filter(week => week.purchases.has(candidate.stats.productId))
      .map(week => ({ uses: familyUses(week), quantity: week.purchases.get(candidate.stats.productId)! })),
  }));
  // Only when one product dominates the family: many kinds of "queso" tell nothing about grated cheese.
  const familyPurchaseWeeks = familyWeeks.filter(week => near.some(candidate => week.purchases.has(candidate.stats.productId))).length;
  const family = familyWithSamples
    .filter(candidate => candidate.samples.length >= 2 && candidate.samples.length / familyPurchaseWeeks >= 0.6)
    .filter(candidate => candidate.samples.length / familyWeeks.length >= Math.max(MIN_PURCHASE_RATE, 1.3 * share(candidate)))
    .sort(byPreference)[0];
  if (family) return { ...family, evidenceWeeks: familyWeeks.length, basis: "familia" };

  const habitual = near
    .filter(candidate => candidate.match.score >= 0.33 && share(candidate) >= HABITUAL_PARTIAL_SHARE)
    .sort(byPreference)[0];
  if (habitual) return ingredientChoice(habitual, "habitual");

  // A single word found at the end of a name is a brand ("Nutella"); longer ingredients there are flavours.
  if (group.tokens.length > 1) return null;
  const brand = candidates.filter(candidate => candidate.match.full && !claimedByName.has(candidate.stats.productId)).sort(byPreference)[0];
  return ingredientChoice(brand, "ingrediente");
}

function dishesText(recipes: string[], dishes: number): string {
  const names = recipes.length > 3 ? `${recipes.slice(0, 3).join(", ")}…` : recipes.join(", ");
  return `Para ${plural(dishes, "plato", "platos")} (${names})`;
}

interface ProductAccumulator {
  item: PlanItem;
  dishes: Set<number>;
  samples: QuantitySample[];
  fallback: number[];
  strength: number;
  reasonTail: string;
}

/**
 * Every ingredient of every dish in the menu goes to the cart: the history
 * only decides which product she buys for it and how much per dish.
 */
export function buildCartPlan(input: BuildCartPlanInput): CartPlan {
  const recipesById = new Map(input.recipes.map(recipe => [recipe.id, recipe]));
  const products = new Map<string, ProductStats>();
  const orders = input.orders
    .filter(order => order.lines.length > 0)
    .sort((a, b) => Date.parse(a.deliveredAt) - Date.parse(b.deliveredAt));
  for (const order of orders) {
    for (const [productId, quantity] of orderPurchases(order)) {
      const line = order.lines.find(candidate => candidate.productId === productId)!;
      let stats = products.get(productId);
      if (!stats) {
        stats = {
          productId,
          name: line.name,
          tokens: tokenize(line.name),
          category: line.category ?? null,
          unitPrice: line.unitPrice ?? null,
          thumbnail: line.thumbnail ?? null,
          orderCount: 0,
          quantities: [],
        };
        products.set(productId, stats);
      }
      stats.orderCount++;
      stats.quantities.push(quantity);
      // Orders are processed oldest first, so the latest price and photo win.
      if (line.unitPrice) stats.unitPrice = line.unitPrice;
      if (line.thumbnail) stats.thumbnail = line.thumbnail;
    }
  }

  const current = new IngredientIndex();
  input.menuRecipeIds.forEach((recipeId, dish) => {
    const recipe = recipesById.get(recipeId);
    if (!recipe) return;
    for (const ingredient of recipe.ingredients) current.add(ingredient, recipe.name, dish);
  });

  const pairs = pairMenusWithOrders(input.pastMenus, orders);
  const weeks: PairedWeek[] = pairs.map(({ menu, order }) => {
    const ingredientUses = new Map<string, number>();
    const dishHeads: string[][] = [];
    for (const recipeId of menu.recipeIds) {
      const recipe = recipesById.get(recipeId);
      if (!recipe) continue;
      const ingredients = recipeIngredientTokens(recipe);
      dishHeads.push(ingredients.map(tokens => tokens[0]));
      for (const tokens of ingredients) {
        const group = current.find(tokens);
        if (group) ingredientUses.set(group.key, (ingredientUses.get(group.key) ?? 0) + 1);
      }
    }
    return { ingredientUses, dishHeads, purchases: orderPurchases(order) };
  });

  const merged = new Map<string, ProductAccumulator>();
  const searchItems: PlanItem[] = [];

  const analysed = current.groups.map(group => {
    const weeksWithIngredient = weeks.filter(week => week.ingredientUses.has(group.key));
    const candidates: Candidate[] = [];
    for (const stats of products.values()) {
      const match = matchIngredientToProduct(group.tokens, stats.tokens);
      if (!match) continue;
      const samples = weeksWithIngredient
        .filter(week => week.purchases.has(stats.productId))
        .map(week => ({ uses: week.ingredientUses.get(group.key)!, quantity: week.purchases.get(stats.productId)! }));
      candidates.push({ stats, match, samples });
    }
    return { group, candidates, evidenceWeeks: weeksWithIngredient.length };
  });
  const claimedByName = new Set(analysed.flatMap(({ candidates }) => {
    const full = candidates.filter(candidate => candidate.match.full && candidate.match.headPosition < HEAD_WINDOW).sort(byPreference)[0];
    return full ? [full.stats.productId] : [];
  }));

  for (const { group, candidates, evidenceWeeks } of analysed) {
    const choice = chooseProduct(group, candidates, evidenceWeeks, weeks, orders.length, claimedByName);
    if (!choice) {
      const searchQuery = searchQueryFor(group.labels.reduce((shortest, label) => label.length < shortest.length ? label : shortest));
      searchItems.push({
        key: group.key, ingredients: [...group.labels], recipes: [...group.recipes], productId: null, productName: null,
        searchQuery, quantity: 1, category: null, unitPrice: null, thumbnail: null, source: "busqueda", confidence: "baja",
        reason: `${dishesText(group.recipes, group.dishes.size)}. No lo has comprado antes en Mercadona: se buscará «${searchQuery}».`,
      });
      continue;
    }

    const { stats, samples } = choice;
    const support = samples.length;
    const rarelyBought = choice.evidenceWeeks >= MIN_EVIDENCE_WEEKS && support / choice.evidenceWeeks < MIN_PURCHASE_RATE;
    let reasonTail: string;
    let confidence: PlanConfidence;
    if (choice.basis === "familia") {
      const family = group.labels[0].trim().split(/\s+/)[0].toLocaleLowerCase("es");
      reasonTail = `Es lo que compras cuando hay «${family}» en el menú (${support} de ${plural(choice.evidenceWeeks, "semana", "semanas")}).`;
      confidence = "media";
    } else if (support > 0) {
      reasonTail = `Cantidad según lo que compraste las ${plural(support, "semana", "semanas")} que lo tuviste en el menú.`;
      confidence = support >= MIN_EVIDENCE_WEEKS && choice.match.full ? "alta" : "media";
    } else {
      reasonTail = `Es el producto que sueles comprar (${plural(stats.orderCount, "pedido", "pedidos")}).`;
      confidence = stats.orderCount / Math.max(orders.length, 1) >= 0.3 ? "media" : "baja";
    }
    if (rarelyBought) {
      reasonTail += " Casi nunca lo compras con estos platos: comprueba si ya lo tienes en casa.";
      confidence = "baja";
    }

    const strength = support + (choice.match.full ? 0.5 : 0);
    const existing = merged.get(stats.productId);
    if (existing) {
      for (const dish of group.dishes) existing.dishes.add(dish);
      existing.item.ingredients.push(...group.labels.filter(label => !existing.item.ingredients.includes(label)));
      existing.item.recipes.push(...group.recipes.filter(recipe => !existing.item.recipes.includes(recipe)));
      if (strength > existing.strength) {
        Object.assign(existing, { samples, strength, reasonTail });
        existing.item.confidence = confidence;
      }
      continue;
    }
    merged.set(stats.productId, {
      item: {
        key: group.key, ingredients: [...group.labels], recipes: [...group.recipes], productId: stats.productId,
        productName: stats.name, searchQuery: searchQueryFor(group.labels[0]), quantity: 1, category: stats.category,
        unitPrice: stats.unitPrice, thumbnail: stats.thumbnail, source: "historial", confidence, reason: "",
      },
      dishes: new Set(group.dishes),
      samples,
      fallback: stats.quantities,
      strength,
      reasonTail,
    });
  }

  // Quantities are computed once all the dishes that need each product are known.
  const items = [...merged.values()].map(({ item, dishes, samples, fallback, reasonTail }) => ({
    ...item,
    quantity: quantityForDishes(samples, dishes.size, fallback),
    reason: `${dishesText(item.recipes, dishes.size)}. ${reasonTail}`,
  })).sort((a, b) =>
    (a.category ?? "~").localeCompare(b.category ?? "~", "es") || (a.productName ?? "").localeCompare(b.productName ?? "", "es"));
  const deliveredTimes = orders.map(order => Date.parse(order.deliveredAt)).filter(time => !Number.isNaN(time)).sort((a, b) => a - b);

  return {
    items: [...items, ...searchItems],
    purchasedProductIds: [...products.values()]
      .sort((a, b) => b.orderCount - a.orderCount || a.name.localeCompare(b.name, "es"))
      .map(stats => stats.productId),
    stats: {
      ordersAnalyzed: orders.length,
      weeksPaired: pairs.length,
      firstOrderAt: deliveredTimes.length ? new Date(deliveredTimes[0]).toISOString() : null,
      lastOrderAt: deliveredTimes.length ? new Date(deliveredTimes[deliveredTimes.length - 1]).toISOString() : null,
    },
  };
}
