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
  "albondigas-con-tomate",
  "alcachofas",
  "arroz-a-la-milanesa",
  "arroz-blanco",
  "arroz-blanco-con-tomate-y-jamon-york",
  "atun-con-tomate",
  "bacalao-con-tomate",
  "berenjenas-con-mozzarella",
  "bizcocho",
  "boquerones-fritos",
  "brocoli-con-mayonesa",
  "calabacin-con-tomate-arcoiris",
  "calamares-fritos",
  "carne-guisada",
  "chuleta-de-sajonia",
  "cinta-de-lomo",
  "cogollos-con-anchoas",
  "consome",
  "crema-de-calabacin",
  "crema-de-zanahoria",
  "croquetas",
  "dorada-o-lubina-a-la-sal",
  "ensalada-caprese",
  "ensalada-de-burrata",
  "ensalada-de-espinacas",
  "ensalada-de-rucula",
  "ensalada-de-verano",
  "ensalada-gourmet",
  "ensalada-griega",
  "ensalada-murciana",
  "ensaladilla-rusa",
  "espaguetis",
  "espaguetis-con-trufa",
  "esparragos-trigueros-a-la-plancha",
  "filetes-de-ternera-a-la-plancha",
  "gallos",
  "gazpacho",
  "guisantes-con-jamon",
  "habas-con-jamon",
  "huevos-con-bechamel",
  "huevos-fritos-con-patatas",
  "huevos-revueltos-con-jamon-y-champinones",
  "jamoncitos",
  "judias-verdes-con-jamon",
  "lasana",
  "lenguado-con-mantequilla-y-limon",
  "lentejas",
  "lomo-con-queso",
  "lubina-a-la-plancha",
  "magra-con-tomate",
  "merluza-al-horno-con-ajos",
  "merluza-frita-rebozada",
  "mousse-de-chocolate",
  "paella",
  "pastel-de-sandwich",
  "patatas-con-chorizo",
  "pechugas-de-pollo-a-la-mostaza",
  "pechugas-de-pollo-empanadas",
  "pechugas-de-pollo-plancha",
  "pechugas-villaroy",
  "pimientos-del-padron",
  "pisto",
  "pizza",
  "pollo-al-limon",
  "pollo-asado",
  "pulpo-a-la-gallega",
  "pure-de-verdura",
  "quiche",
  "rape",
  "revuelto-de-ajetes-y-gambas",
  "rodaballo-a-la-plancha",
  "salchichas-al-vino",
  "salmon-a-la-sal",
  "salmorejo",
  "sepia",
  "setas-a-la-plancha",
  "solomillo-al-roquefort",
  "sopa-de-cebolla",
  "sopa-de-letras",
  "ternera-al-ron-con-setas-thermomix",
  "tomate-frito",
  "tortilla-de-patata",
  "verduras-a-la-plancha",
  "vichyssoise",
]);

/** Returns the public URL of the dish photo for a recipe, or null if none. */
export function getRecipeImageUrl(name: string): string | null {
  const slug = slugifyRecipe(name);
  if (!SLUGS_WITH_IMAGES.has(slug)) return null;
  return `${import.meta.env.BASE_URL}recipe-images/${slug}.jpg`;
}
