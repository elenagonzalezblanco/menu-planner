export type SupermarketId = "mercadona" | "carrefour";

type Supermarket = {
  name: string;
  storeUrl: string;
  searchUrl: (ingredient: string) => string;
  iconClassName: string;
  linkClassName: string;
  rowClassName: string;
  ingredientClassName: string;
};

export const supermarkets: Record<SupermarketId, Supermarket> = {
  mercadona: {
    name: "Mercadona",
    storeUrl: "https://tienda.mercadona.es",
    searchUrl: ingredient =>
      `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(ingredient)}`,
    iconClassName: "bg-[#00823F]",
    linkClassName: "border-[#00823F] text-[#00823F] hover:bg-[#00823F]/5",
    rowClassName: "hover:bg-[#00823F]/4",
    ingredientClassName: "group-hover:text-[#00823F]",
  },
  carrefour: {
    name: "Carrefour",
    storeUrl: "https://www.carrefour.es/supermercado/",
    searchUrl: ingredient =>
      `https://www.carrefour.es/supermercado?query=${encodeURIComponent(ingredient)}`,
    iconClassName: "bg-[#004E9B]",
    linkClassName: "border-[#004E9B] text-[#004E9B] hover:bg-[#004E9B]/5",
    rowClassName: "hover:bg-[#004E9B]/4",
    ingredientClassName: "group-hover:text-[#004E9B]",
  },
};

export function buildSupermarketSearchUrl(supermarket: SupermarketId, ingredient: string) {
  return supermarkets[supermarket].searchUrl(ingredient);
}
