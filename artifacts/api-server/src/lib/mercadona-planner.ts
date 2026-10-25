/**
 * Builds a Mercadona cart from the weekly menu using the user's own purchase
 * history: for every ingredient it learns which product she buys and how many
 * units, by pairing each past weekly menu with the order delivered right after
 * it. Pure and deterministic so it can be unit-tested without a database.
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

export interface SkippedIngredient {
  key: string;
  ingredients: string[];
  recipes: string[];
  productId: string | null;
  productName: string | null;
  quantity: number;
  reason: string;
}

export interface CartPlan {
  items: PlanItem[];
  skipped: SkippedIngredient[];
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
  extraIngredients?: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A menu is paired with the first order delivered up to this many days after it was saved. */
export const PAIRING_WINDOW_DAYS = 5;
/** Below this purchase rate (with enough evidence) the ingredient is assumed to be in the pantry. */
export const MIN_PURCHASE_RATE = 0.3;
/** Weeks of evidence needed before trusting a "she does not buy this" signal. */
export const MIN_EVIDENCE_WEEKS = 3;
/** Products present in at least this share of orders are treated as habitual purchases. */
export const HABITUAL_ORDER_SHARE = 0.5;
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

/** Removes amounts and notes so the text works as a supermarket search ("200 g de champiñones (opcional)" → "champiñones"). */
export function searchQueryFor(label: string): string {
  const cleaned = label
    .replace(/\([^)]*\)/g, " ")
    .replace(/^\s*[\d.,/½¼¾]+\s*(?:g|gr|kg|ml|l|cl|ud|uds|unidades?|cucharadas?|cdas?|tazas?|sobres?|latas?|botes?|hojas?|dientes?)?\.?\s+(?:de\s+)?/i, "")
    .replace(/\s+[\d.,/]+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || label.trim();
}

function sameTokens(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, index) => tokensMatch(token, b[index]));
}

function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Median clamped to what she has actually bought, rounded half up, never below one unit. */
export function usualQuantity(quantities: number[]): number {
  if (quantities.length === 0) return 1;
  const value = Math.min(Math.max(median(quantities), Math.min(...quantities)), Math.max(...quantities));
  return Math.max(1, Math.floor(value + 0.5));
}

function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

interface IngredientGroup {
  key: string;
  tokens: string[];
  labels: string[];
  recipes: Set<string>;
}

class IngredientIndex {
  readonly groups: IngredientGroup[] = [];

  add(label: string, recipe: string | null): IngredientGroup | null {
    const tokens = tokenize(label);
    if (tokens.length === 0) return null;
    let group = this.groups.find(existing => sameTokens(existing.tokens, tokens));
    if (!group) {
      group = { key: tokens.join(" "), tokens, labels: [], recipes: new Set() };
      this.groups.push(group);
    }
    const trimmed = label.trim();
    if (!group.labels.some(existing => normalizeText(existing) === normalizeText(trimmed))) group.labels.push(trimmed);
    if (recipe) group.recipes.add(recipe);
    return group;
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
  ingredientKeys: Set<string>;
  ingredientHeads: string[];
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
    purchases.set(line.productId, (purchases.get(line.productId) ?? 0) + line.quantity);
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
  /** Paired weeks with this exact ingredient on the menu in which the product was bought. */
  support: number;
  quantities: number[];
}

interface ProductChoice extends Candidate {
  evidenceWeeks: number;
  basis: "ingrediente" | "familia" | "habitual";
}

const byPreference = (a: Candidate, b: Candidate) =>
  b.support - a.support || b.stats.orderCount - a.stats.orderCount || a.stats.name.length - b.stats.name.length;

/**
 * Tiers, from strongest to weakest evidence: same name; partial name that
 * follows the menu; any product of the same family ("merluza …") bought when
 * that family is on the menu; partial name of an almost-weekly product; brand
 * named at the end of the product ("Nutella").
 */
function chooseProduct(
  group: IngredientGroup, candidates: Candidate[], evidenceWeeks: number, weeks: PairedWeek[], orderTotal: number,
): ProductChoice | null {
  const share = (candidate: Candidate) => candidate.stats.orderCount / Math.max(orderTotal, 1);
  const near = candidates.filter(candidate => candidate.match.headPosition < HEAD_WINDOW);
  const ingredientChoice = (candidate: Candidate | undefined, basis: ProductChoice["basis"]): ProductChoice | null =>
    candidate ? { ...candidate, evidenceWeeks, basis } : null;

  const full = near.filter(candidate => candidate.match.full).sort(byPreference)[0];
  if (full) return ingredientChoice(full, "ingrediente");

  const learned = near
    .filter(candidate => candidate.match.score >= 0.5 && candidate.support >= 2)
    .filter(candidate => candidate.support / evidenceWeeks >= 1.3 * share(candidate))
    .sort(byPreference)[0];
  if (learned) return ingredientChoice(learned, "ingrediente");

  const familyWeeks = weeks.filter(week => week.ingredientHeads.some(head => tokensMatch(head, group.tokens[0])));
  const familyWithSupport = near.map(candidate => {
    const quantities = familyWeeks
      .map(week => week.purchases.get(candidate.stats.productId))
      .filter((quantity): quantity is number => quantity !== undefined);
    return { ...candidate, support: quantities.length, quantities };
  });
  // Only when one product dominates the family: many kinds of "queso" tell nothing about grated cheese.
  const familyPurchaseWeeks = familyWeeks.filter(week => near.some(candidate => week.purchases.has(candidate.stats.productId))).length;
  const family = familyWithSupport
    .filter(candidate => candidate.support >= 2 && candidate.support / familyPurchaseWeeks >= 0.6)
    .filter(candidate => candidate.support / familyWeeks.length >= Math.max(MIN_PURCHASE_RATE, 1.3 * share(candidate)))
    .sort(byPreference)[0];
  if (family) return { ...family, evidenceWeeks: familyWeeks.length, basis: "familia" };

  const habitual = near
    .filter(candidate => candidate.match.score >= 0.33 && share(candidate) >= HABITUAL_PARTIAL_SHARE)
    .sort(byPreference)[0];
  if (habitual) return ingredientChoice(habitual, "habitual");

  const brand = candidates.filter(candidate => candidate.match.full).sort(byPreference)[0];
  return ingredientChoice(brand, "ingrediente");
}

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
  for (const recipeId of input.menuRecipeIds) {
    const recipe = recipesById.get(recipeId);
    if (!recipe) continue;
    for (const ingredient of recipe.ingredients) current.add(ingredient, recipe.name);
  }
  for (const extra of input.extraIngredients ?? []) current.add(extra, null);

  const pairs = pairMenusWithOrders(input.pastMenus, orders);
  const weeks: PairedWeek[] = pairs.map(({ menu, order }) => {
    const ingredientKeys = new Set<string>();
    const ingredientHeads: string[] = [];
    for (const recipeId of menu.recipeIds) {
      const recipe = recipesById.get(recipeId);
      if (!recipe) continue;
      for (const tokens of recipeIngredientTokens(recipe)) {
        ingredientHeads.push(tokens[0]);
        const group = current.find(tokens);
        if (group) ingredientKeys.add(group.key);
      }
    }
    return { ingredientKeys, ingredientHeads, purchases: orderPurchases(order) };
  });

  const merged = new Map<string, PlanItem>();
  const searchItems: PlanItem[] = [];
  const skipped: SkippedIngredient[] = [];

  for (const group of current.groups) {
    const label = group.labels[0];
    const recipes = [...group.recipes];
    const weeksWithIngredient = weeks.filter(week => week.ingredientKeys.has(group.key));
    const evidenceWeeks = weeksWithIngredient.length;

    const candidates: Candidate[] = [];
    for (const stats of products.values()) {
      const match = matchIngredientToProduct(group.tokens, stats.tokens);
      if (!match) continue;
      const quantities = weeksWithIngredient
        .map(week => week.purchases.get(stats.productId))
        .filter((quantity): quantity is number => quantity !== undefined);
      candidates.push({ stats, match, support: quantities.length, quantities });
    }

    const choice = chooseProduct(group, candidates, evidenceWeeks, weeks, orders.length);

    if (!choice) {
      if (evidenceWeeks >= MIN_EVIDENCE_WEEKS) {
        skipped.push({
          key: group.key, ingredients: group.labels, recipes, productId: null, productName: null, quantity: 0,
          reason: `En ${plural(evidenceWeeks, "semana", "semanas")} con «${label}» en el menú no compraste nada parecido en Mercadona.`,
        });
      } else {
        const searchQuery = searchQueryFor(group.labels.reduce((shortest, current) => current.length < shortest.length ? current : shortest));
        searchItems.push({
          key: group.key, ingredients: group.labels, recipes, productId: null, productName: null,
          searchQuery, quantity: 1, category: null, unitPrice: null, thumbnail: null, source: "busqueda", confidence: "baja",
          reason: `Sin historial de compra: se buscará «${searchQuery}» en Mercadona y se añadirá el primer resultado.`,
        });
      }
      continue;
    }

    const { stats, support } = choice;
    const purchaseRate = choice.evidenceWeeks > 0 ? support / choice.evidenceWeeks : 0;
    const quantity = usualQuantity(support > 0 ? choice.quantities : stats.quantities);

    if (choice.evidenceWeeks >= MIN_EVIDENCE_WEEKS && purchaseRate < MIN_PURCHASE_RATE && stats.orderCount / Math.max(orders.length, 1) < HABITUAL_ORDER_SHARE) {
      skipped.push({
        key: group.key, ingredients: group.labels, recipes, productId: stats.productId, productName: stats.name, quantity,
        reason: support === 0
          ? `En ${plural(choice.evidenceWeeks, "semana", "semanas")} con «${label}» en el menú no lo compraste: lo tendrás en casa o lo sustituyes.`
          : `En ${plural(choice.evidenceWeeks, "semana", "semanas")} con «${label}» en el menú solo lo compraste ${plural(support, "vez", "veces")}: lo tendrás en casa.`,
      });
      continue;
    }

    let reason: string;
    let confidence: PlanConfidence;
    if (choice.basis === "familia") {
      const family = label.trim().split(/\s+/)[0].toLocaleLowerCase("es");
      reason = `Cuando hay «${family}» en el menú lo compras (${support} de ${plural(choice.evidenceWeeks, "semana", "semanas")}); sueles coger ${quantity}.`;
      confidence = "media";
    } else if (support > 0) {
      reason = `Lo compraste en ${support} de ${plural(choice.evidenceWeeks, "semana", "semanas")} con «${label}» en el menú; sueles coger ${quantity}.`;
      confidence = support >= MIN_EVIDENCE_WEEKS && choice.match.full ? "alta" : "media";
    } else {
      reason = `Es el producto que sueles comprar para «${label}» (${plural(stats.orderCount, "pedido", "pedidos")}).`;
      confidence = stats.orderCount / Math.max(orders.length, 1) >= 0.3 ? "media" : "baja";
    }

    const existing = merged.get(stats.productId);
    if (existing) {
      existing.quantity = Math.max(existing.quantity, quantity);
      existing.ingredients.push(...group.labels.filter(labelText => !existing.ingredients.includes(labelText)));
      existing.recipes.push(...recipes.filter(recipe => !existing.recipes.includes(recipe)));
      if (confidence === "alta" || (confidence === "media" && existing.confidence === "baja")) {
        existing.confidence = confidence;
        existing.reason = reason;
      }
      continue;
    }
    merged.set(stats.productId, {
      key: group.key, ingredients: [...group.labels], recipes, productId: stats.productId, productName: stats.name,
      searchQuery: searchQueryFor(label), quantity, category: stats.category, unitPrice: stats.unitPrice, thumbnail: stats.thumbnail,
      source: "historial", confidence, reason,
    });
  }

  const items = [...merged.values()].sort((a, b) =>
    (a.category ?? "~").localeCompare(b.category ?? "~", "es") || (a.productName ?? "").localeCompare(b.productName ?? "", "es"));
  const deliveredTimes = orders.map(order => Date.parse(order.deliveredAt)).filter(time => !Number.isNaN(time)).sort((a, b) => a - b);

  return {
    items: [...items, ...searchItems],
    skipped,
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
