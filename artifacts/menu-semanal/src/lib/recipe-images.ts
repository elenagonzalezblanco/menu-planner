/**
 * Maps recipes to dish photos extracted from the user's original recipe PDFs.
 * Only recipes whose PDF contained a usable photo are included.
 *
 * Images live in `public/recipe-images/<slug>.jpg` and are served as static
 * assets, so they work both locally and in the deployed build.
 */

export function slugifyRecipe(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

const SLUGS_WITH_IMAGES = new Set<string>([
  "bacalao-con-tomate",
  "crema-de-zanahoria",
  "pechugas-de-pollo-empanadas",
  "alcachofas",
  "arroz-a-la-milanesa",
  "arroz-blanco-con-tomate-y-jamon-york",
  "atun-con-tomate",
  "berenjenas-con-mozzarella",
  "boquerones-fritos",
  "brocoli-con-mayonesa",
  "calabacin-con-tomate-arcoiris",
  "calamares-fritos",
  "carne-guisada",
  "chuleta-de-sajonia",
  "cinta-de-lomo",
  "cogollos-con-anchoas",
  "consome",
  "dorada-o-lubina-a-la-sal",
  "ensalada-caprese",
  "ensalada-de-espinacas",
  "ensalada-de-rucula",
  "ensalada-de-verano",
  "ensalada-gourmet",
  "ensalada-griega",
  "ensaladilla-rusa",
  "espaguetis",
  "filetes-de-ternera-a-la-plancha",
  "gazpacho",
  "guisantes-con-jamon",
  "huevos-con-bechamel",
  "huevos-fritos-con-patatas",
  "huevos-revueltos-con-jamon-y-champinones",
  "jamoncitos",
  "judias-verdes-con-jamon",
  "lasana",
  "lentejas",
  "magra-con-tomate",
  "merluza-frita-rebozada",
  "mousse-de-chocolate",
  "patatas-de-remoste",
  "pechugas-de-pollo-a-la-mostaza",
]);

/** Returns the public URL of the dish photo for a recipe, or null if none. */
export function getRecipeImageUrl(name: string): string | null {
  const slug = slugifyRecipe(name);
  if (!SLUGS_WITH_IMAGES.has(slug)) return null;
  return `${import.meta.env.BASE_URL}recipe-images/${slug}.jpg`;
}
