import { storageGet, storageSet, generateId } from './storage';

export interface Recipe {
  id: string;
  name: string;
  category: 'primero' | 'segundo' | 'otro';
  ingredients: string[];
  instructions?: string;
  createdAt: string;
}

const STORAGE_KEY = 'recipes';

function getAll(userId: string): Recipe[] {
  return storageGet<Recipe[]>(userId, STORAGE_KEY) ?? [];
}

function saveAll(userId: string, recipes: Recipe[]): void {
  storageSet(userId, STORAGE_KEY, recipes);
}

export function listRecipes(userId: string, category?: string): Recipe[] {
  const all = getAll(userId);
  const filtered = category ? all.filter(r => r.category === category) : all;
  return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export function getRecipe(userId: string, id: string): Recipe | null {
  return getAll(userId).find(r => r.id === id) ?? null;
}

export function createRecipe(
  userId: string,
  input: Omit<Recipe, 'id' | 'createdAt'>,
): Recipe {
  const all = getAll(userId);
  const recipe: Recipe = {
    ...input,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  saveAll(userId, [...all, recipe]);
  return recipe;
}

export function updateRecipe(
  userId: string,
  id: string,
  input: Partial<Omit<Recipe, 'id' | 'createdAt'>>,
): Recipe | null {
  const all = getAll(userId);
  const idx = all.findIndex(r => r.id === id);
  if (idx === -1) return null;
  const updated: Recipe = { ...all[idx], ...input };
  all[idx] = updated;
  saveAll(userId, all);
  return updated;
}

export function deleteRecipe(userId: string, id: string): void {
  const all = getAll(userId);
  saveAll(userId, all.filter(r => r.id !== id));
}

// ── Default Spanish recipes ──────────────────────────────────────────────────

const DEFAULT_RECIPES: Omit<Recipe, 'id' | 'createdAt'>[] = [
  // Primeros
  {
    category: 'primero',
    name: 'Gazpacho',
    ingredients: [
      'tomates maduros',
      'pepino',
      'pimiento rojo',
      'ajo',
      'pan del día anterior',
      'aceite de oliva virgen extra',
      'vinagre de jerez',
      'sal',
    ],
    instructions:
      'Trocea todas las verduras y tritura junto con el pan remojado. Añade aceite, vinagre y sal. Cuela y enfría en la nevera al menos 2 horas.',
  },
  {
    category: 'primero',
    name: 'Salmorejo',
    ingredients: [
      'tomates maduros',
      'pan del día anterior',
      'ajo',
      'aceite de oliva virgen extra',
      'sal',
      'jamón serrano',
      'huevo duro',
    ],
    instructions:
      'Tritura los tomates con el pan, el ajo y la sal. Emulsiona con el aceite hasta obtener una crema densa. Sirve con taquitos de jamón y huevo duro picado.',
  },
  {
    category: 'primero',
    name: 'Crema de zanahoria',
    ingredients: [
      'zanahorias',
      'cebolla',
      'patata',
      'aceite de oliva',
      'sal',
      'pimienta',
      'caldo de verduras',
    ],
    instructions:
      'Sofríe la cebolla y zanahoria. Añade la patata y el caldo. Cocina 20 min y tritura hasta obtener una crema suave.',
  },
  {
    category: 'primero',
    name: 'Vichyssoise',
    ingredients: [
      'puerros',
      'patatas',
      'caldo de verduras',
      'nata',
      'mantequilla',
      'sal',
      'pimienta blanca',
    ],
    instructions:
      'Pocha los puerros en mantequilla. Añade las patatas y el caldo y cocina 25 min. Tritura, añade la nata y enfría. Sirve fría.',
  },
  {
    category: 'primero',
    name: 'Sopa de calabacín',
    ingredients: [
      'calabacín',
      'cebolla',
      'quesitos cremosos',
      'aceite de oliva',
      'sal',
      'caldo de verduras',
    ],
    instructions:
      'Sofríe la cebolla y el calabacín. Cubre con caldo y cocina 15 min. Añade los quesitos y tritura.',
  },
  // Segundos — carne
  {
    category: 'segundo',
    name: 'Pollo de la abuela',
    ingredients: [
      'pollo troceado',
      'ajo',
      'vino blanco',
      'limón',
      'aceite de oliva',
      'laurel',
      'sal',
      'pimienta',
    ],
    instructions:
      'Dora el pollo en aceite. Añade los ajos, el vino, el zumo de limón y el laurel. Guisa a fuego lento 45 min hasta que esté tierno.',
  },
  {
    category: 'segundo',
    name: 'Albóndigas',
    ingredients: [
      'carne picada mixta',
      'cebolla',
      'ajo',
      'huevo',
      'pan rallado',
      'perejil',
      'tomate frito',
      'aceite de oliva',
      'sal',
    ],
    instructions:
      'Mezcla la carne con el huevo, pan rallado, ajo y perejil. Forma las albóndigas, fríelas y guísalas en salsa de tomate 20 min.',
  },
  {
    category: 'segundo',
    name: 'Pechugas de pollo empanadas',
    ingredients: [
      'pechuga de pollo',
      'pan rallado',
      'huevo',
      'aceite de oliva',
      'sal',
      'limón',
    ],
    instructions:
      'Aplana las pechugas, salpimienta, pasa por huevo y pan rallado. Fríe en aceite caliente hasta dorar por ambos lados. Sirve con limón.',
  },
  {
    category: 'segundo',
    name: 'Judías verdes con jamón',
    ingredients: [
      'judías verdes',
      'jamón serrano',
      'ajo',
      'aceite de oliva',
      'sal',
    ],
    instructions:
      'Cuece las judías en agua con sal. Escurre y saltéalas en aceite con ajo laminado y taquitos de jamón.',
  },
  // Segundos — pescado
  {
    category: 'segundo',
    name: 'Merluza al horno con ajos',
    ingredients: [
      'merluza en rodajas',
      'ajo',
      'aceite de oliva',
      'perejil',
      'sal',
      'pimienta',
      'limón',
    ],
    instructions:
      'Coloca la merluza en una fuente de horno. Lamina los ajos y sofríelos en aceite. Vierte sobre el pescado y hornea a 180 °C durante 20 min.',
  },
  {
    category: 'segundo',
    name: 'Merluza frita rebozada',
    ingredients: [
      'merluza fileteada',
      'harina',
      'huevo',
      'aceite de oliva',
      'sal',
      'limón',
    ],
    instructions:
      'Salpimienta los filetes, pásalos por harina y huevo batido. Fríe en aceite abundante caliente hasta dorar. Sirve con limón.',
  },
  {
    category: 'segundo',
    name: 'Dorada a la sal',
    ingredients: [
      'dorada',
      'sal gruesa',
      'limón',
      'aceite de oliva',
    ],
    instructions:
      'Cubre el fondo de la fuente con sal gruesa. Coloca la dorada encima y cúbrela completamente con más sal. Hornea a 200 °C 25 min. Rompe la costra de sal y sirve con aceite y limón.',
  },
  // Otros
  {
    category: 'otro',
    name: 'Arroz blanco con tomate y jamón York',
    ingredients: [
      'arroz',
      'salsa de tomate',
      'jamón york',
      'aceite de oliva',
      'sal',
    ],
    instructions:
      'Cuece el arroz en agua con sal. Escurre y mezcla con salsa de tomate caliente y taquitos de jamón york.',
  },
  {
    category: 'otro',
    name: 'Espaguetis con tomate',
    ingredients: [
      'espaguetis',
      'tomate frito',
      'ajo',
      'aceite de oliva',
      'sal',
      'queso parmesano',
    ],
    instructions:
      'Cuece los espaguetis al dente. Sofríe el ajo en aceite, añade el tomate y calienta. Mezcla con la pasta y sirve con parmesano rallado.',
  },
  {
    category: 'otro',
    name: 'Tortilla de patata',
    ingredients: [
      'patatas',
      'huevos',
      'cebolla',
      'aceite de oliva',
      'sal',
    ],
    instructions:
      'Fríe las patatas con cebolla a fuego lento hasta pocharlas. Escurre el aceite y mezcla con los huevos batidos y sal. Cuaja la tortilla por ambos lados.',
  },
];

export function seedDefaultRecipes(userId: string): void {
  const existing = getAll(userId);
  if (existing.length > 0) return;

  const seeded: Recipe[] = DEFAULT_RECIPES.map(r => ({
    ...r,
    id: generateId(),
    createdAt: new Date().toISOString(),
  }));
  saveAll(userId, seeded);
}
