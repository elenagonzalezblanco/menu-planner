import { storageGet, storageSet, generateId } from './storage';
import { listRecipes, type Recipe } from './recipes-storage';

// ── Public types ─────────────────────────────────────────────────────────────

export type { Recipe };

export interface MealPlan {
  primero?: Recipe;
  segundo?: Recipe;
  primero2?: Recipe;
  segundo2?: Recipe;
}

export interface DayMenu {
  day: string;
  lunch: MealPlan;
  dinner: MealPlan;
}

export interface WeeklyMenu {
  id: string;
  days: DayMenu[];
  createdAt: string;
}

export interface SavedMenu {
  id: string;
  label: string;
  days: DayMenu[];
  savedAt: string;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_KEY = 'menus';
const SAVED_MENUS_KEY = 'saved_menus';

function getAll(userId: string): WeeklyMenu[] {
  return storageGet<WeeklyMenu[]>(userId, STORAGE_KEY) ?? [];
}

export function listMenus(userId: string): WeeklyMenu[] {
  return getAll(userId);
}

export function getMenu(userId: string, id: string): WeeklyMenu | null {
  return getAll(userId).find(m => m.id === id) ?? null;
}

export function deleteMenu(userId: string, id: string): void {
  const all = getAll(userId);
  storageSet(userId, STORAGE_KEY, all.filter(m => m.id !== id));
}

// ── Saved menus (explicit user saves) ───────────────────────────────────────

export function listSavedMenus(userId: string): SavedMenu[] {
  return storageGet<SavedMenu[]>(userId, SAVED_MENUS_KEY) ?? [];
}

export function saveMenuToProfile(userId: string, days: DayMenu[], label: string): SavedMenu {
  const entry: SavedMenu = {
    id: generateId(),
    label: label.trim() || `Menú del ${new Date().toLocaleDateString('es-ES')}`,
    days,
    savedAt: new Date().toISOString(),
  };
  const all = listSavedMenus(userId);
  storageSet(userId, SAVED_MENUS_KEY, [entry, ...all]);
  return entry;
}

export function deleteSavedMenu(userId: string, id: string): void {
  const all = listSavedMenus(userId);
  storageSet(userId, SAVED_MENUS_KEY, all.filter(m => m.id !== id));
}

// ── Local generation algorithm ───────────────────────────────────────────────

const DAYS_ES = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Fish/seafood keywords from HISTORICAL_CONTEXT, used for meat/fish balance
const FISH_KEYWORDS = [
  'merluza', 'salmón', 'salmon', 'bacalao', 'rape', 'dorada', 'lubina',
  'calamares', 'boquerones', 'gallos', 'pulpo', 'atún', 'atun', 'gambas',
  'ajetes y gambas', 'revuelto de ajetes',
];

function isFish(recipe: Recipe): boolean {
  const lower = recipe.name.toLowerCase();
  return FISH_KEYWORDS.some(k => lower.includes(k));
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// ── Structural constraint parsing (mirrors server-side parseConstraints) ─────

interface Constraints {
  noLunchPrimero: boolean;
  noDinnerPrimero: boolean;
  noFishAtLunch: boolean;
  noFishAtDinner: boolean;
}

function parseConstraints(text: string): Constraints {
  const t = text.toLowerCase();

  const noLunchPrimero =
    /solo segundo[s]?\s*(en\s*(la\s*)?comida|a\s*medio[dí]a|al\s*medio[dí]a)/.test(t) ||
    /(sin|no|nada\s*de)\s*primero\s*(en\s*(la\s*)?comida|a\s*medio[dí]a)/.test(t) ||
    /(comida|medio[dí]a)\s*(sin|no|nada\s*de)\s*primero/.test(t) ||
    (/\bsolo segundo[s]?\b/.test(t) && !/(comida|cena|medio[dí]a|almuerzo)/.test(t));

  const noDinnerPrimero =
    /solo segundo[s]?\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(sin|no|nada\s*de)\s*primero\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(cena)\s*(sin|no|nada\s*de)\s*primero/.test(t) ||
    (/\bsolo segundo[s]?\b/.test(t) && !/(comida|cena|medio[dí]a|almuerzo)/.test(t));

  const noFishAtLunch =
    /(solo|s[oó]lo)\s*(carne|proteína|proteina)\s*(a\s*medio[dí]a|en\s*(la\s*)?comida|al\s*medio[dí]a)/.test(t) ||
    /(sin|no|nada\s*de)\s*(pescado|marisco)\s*(a\s*medio[dí]a|en\s*(la\s*)?comida)/.test(t) ||
    /(comida|medio[dí]a)\s*(sin|no)\s*(pescado|marisco)/.test(t);

  const noFishAtDinner =
    /(solo|s[oó]lo)\s*(carne)\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(sin|no|nada\s*de)\s*(pescado|marisco)\s*(en\s*(la\s*)?cena)/.test(t) ||
    /(cena)\s*(sin|no)\s*(pescado|marisco)/.test(t);

  return { noLunchPrimero, noDinnerPrimero, noFishAtLunch, noFishAtDinner };
}

// ── Day profile: which slots get a primero by default ───────────────────────
// Based on HISTORICAL_CONTEXT patterns:
//   Lunes:   lunch ✓, dinner ✗  (sencillo)
//   Martes:  lunch ✓, dinner ✓
//   Miérco:  lunch ✓, dinner ✓
//   Jueves:  lunch ✗, dinner ✗  (simple day)
//   Viernes: lunch ✓, dinner ✓  (más elaborado)
//   Sábado:  lunch ✓, dinner ✓
//   Domingo: lunch ✓, dinner ✗
const DAY_PRIMERO_PROFILE: { lunch: boolean; dinner: boolean }[] = [
  { lunch: true,  dinner: false }, // Lunes
  { lunch: true,  dinner: true  }, // Martes
  { lunch: true,  dinner: true  }, // Miércoles
  { lunch: false, dinner: false }, // Jueves
  { lunch: true,  dinner: true  }, // Viernes
  { lunch: true,  dinner: true  }, // Sábado
  { lunch: true,  dinner: false }, // Domingo
];

/**
 * Build an interleaved segundo queue that alternates fish/meat.
 * Targets ~1 fish every 3 slots (≈33 % fish).
 */
function buildSegundoQueue(
  fishList: Recipe[],
  meatList: Recipe[],
  otrosList: Recipe[],
  total: number,
): (Recipe | undefined)[] {
  const result: (Recipe | undefined)[] = [];
  let fi = 0, mi = 0, oi = 0;

  for (let i = 0; i < total; i++) {
    const wantFish = i % 3 === 1 && fi < fishList.length;
    if (wantFish) {
      result.push(fishList[fi++]);
    } else if (mi < meatList.length) {
      result.push(meatList[mi++]);
    } else if (fi < fishList.length) {
      result.push(fishList[fi++]);
    } else if (oi < otrosList.length) {
      result.push(otrosList[oi++]);
    } else {
      result.push(undefined);
    }
  }

  return result;
}

export function generateMenu(
  userId: string,
  options?: {
    preferences?: string;
    excludeRecipes?: string[];
    daysCount?: number;
  },
): WeeklyMenu {
  const daysCount = Math.min(options?.daysCount ?? 7, DAYS_ES.length);
  const excludeSet = new Set(options?.excludeRecipes ?? []);
  const constraints = options?.preferences
    ? parseConstraints(options.preferences)
    : { noLunchPrimero: false, noDinnerPrimero: false, noFishAtLunch: false, noFishAtDinner: false };

  const allRecipes = listRecipes(userId);
  const available = allRecipes.filter(r => !excludeSet.has(r.id));

  const primeros  = shuffle(available.filter(r => r.category === 'primero'));
  const fishSecs  = constraints.noFishAtLunch && constraints.noFishAtDinner
    ? []
    : shuffle(available.filter(r => r.category === 'segundo' && isFish(r)));
  const meatSecs  = shuffle(available.filter(r => r.category === 'segundo' && !isFish(r)));
  const otros     = shuffle(available.filter(r => r.category === 'otro'));

  // Total segundo slots = daysCount × 2 (lunch + dinner each day)
  const totalSegundoSlots = daysCount * 2;
  const segundoQueue = buildSegundoQueue(
    fishSecs.filter(r => !(constraints.noFishAtLunch && constraints.noFishAtDinner)),
    meatSecs,
    otros,
    totalSegundoSlots,
  );

  let pi = 0; // primero pointer

  const days: DayMenu[] = DAYS_ES.slice(0, daysCount).map((dayName, dayIdx) => {
    const profile = DAY_PRIMERO_PROFILE[dayIdx] ?? { lunch: true, dinner: false };

    // Determine segundo for each meal
    let lunchSegundo = segundoQueue[dayIdx * 2];
    let dinnerSegundo = segundoQueue[dayIdx * 2 + 1];

    // Apply fish constraints
    if (constraints.noFishAtLunch && lunchSegundo && isFish(lunchSegundo)) {
      // Swap with a non-fish segundo from the otros list
      lunchSegundo = meatSecs.find(r => !segundoQueue.includes(r)) ?? lunchSegundo;
    }
    if (constraints.noFishAtDinner && dinnerSegundo && isFish(dinnerSegundo)) {
      dinnerSegundo = meatSecs.find(r => !segundoQueue.includes(r)) ?? dinnerSegundo;
    }

    // Determine primero for lunch
    let lunchPrimero: Recipe | undefined;
    const wantLunchPrimero = !constraints.noLunchPrimero && profile.lunch;
    if (wantLunchPrimero && pi < primeros.length) {
      lunchPrimero = primeros[pi++];
    }

    // Determine primero for dinner
    let dinnerPrimero: Recipe | undefined;
    const wantDinnerPrimero = !constraints.noDinnerPrimero && profile.dinner;
    if (wantDinnerPrimero && pi < primeros.length) {
      dinnerPrimero = primeros[pi++];
    }

    return {
      day: dayName,
      lunch: {
        primero: lunchPrimero,
        segundo: lunchSegundo,
      },
      dinner: {
        primero: dinnerPrimero,
        segundo: dinnerSegundo,
      },
    };
  });

  const menu: WeeklyMenu = {
    id: generateId(),
    days,
    createdAt: new Date().toISOString(),
  };

  // Prepend new menu (most recent first)
  const existing = getAll(userId);
  storageSet(userId, STORAGE_KEY, [menu, ...existing]);

  return menu;
}

export function saveMenuPlan(userId: string, days: DayMenu[]): WeeklyMenu {
  const menu: WeeklyMenu = {
    id: generateId(),
    days,
    createdAt: new Date().toISOString(),
  };
  const existing = getAll(userId);
  storageSet(userId, STORAGE_KEY, [menu, ...existing]);
  return menu;
}
