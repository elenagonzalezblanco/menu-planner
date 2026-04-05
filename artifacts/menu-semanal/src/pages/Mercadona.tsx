import { useShoppingList } from "@/hooks/use-shopping";
import { useMenus } from "@/hooks/use-menus";
import { useExtraIngredients } from "@/hooks/use-extra-ingredients";
import { ExternalLink, Store, ShoppingCart, Search } from "lucide-react";

function mercadonaSearchUrl(ingredient: string) {
  return `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(ingredient)}`;
}

export default function MercadonaPage() {
  const { data: menus = [] } = useMenus();
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const { data: shoppingList } = useShoppingList(latestMenu?.id ?? 0);
  const { items: extraItems } = useExtraIngredients(latestMenu?.id);

  const ingredients = [
    ...(shoppingList?.items.map((i: { ingredient: string }) => i.ingredient) ?? []),
    ...extraItems,
  ];

  if (!shoppingList) {
    return (
      <div className="space-y-5 pb-20 max-w-3xl mx-auto">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00823F] flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            Mercadona
          </h1>
        </div>
        <div className="text-center py-16 bg-card rounded-2xl border border-dashed border-border">
          <ShoppingCart className="w-12 h-12 mx-auto text-muted-foreground/40 mb-4" />
          <h3 className="font-semibold text-foreground mb-2">Sin lista de compra</h3>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto">
            Genera primero un menú semanal y crea la lista de compra desde "Menú Semanal".
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-20 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00823F] flex items-center justify-center">
              <Store className="w-5 h-5 text-white" />
            </div>
            Mercadona
          </h1>
          <p className="text-muted-foreground mt-1">
            {ingredients.length} ingredientes — haz clic en cada uno para buscarlo directamente en Mercadona
          </p>
        </div>
        <a href="https://tienda.mercadona.es" target="_blank" rel="noreferrer">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#00823F] text-[#00823F] hover:bg-[#00823F]/5 transition-colors text-sm font-medium">
            <ExternalLink className="w-4 h-4" />
            Abrir Mercadona
          </div>
        </a>
      </div>

      {/* Ingredient grid */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Buscar en Mercadona</span>
          <span className="ml-auto text-xs text-muted-foreground">{ingredients.length} ingredientes</span>
        </div>
        <div className="divide-y divide-border/30">
          {ingredients.map((ing, i) => (
            <a
              key={i}
              href={mercadonaSearchUrl(ing)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#00823F]/4 group transition-colors"
            >
              <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{i + 1}</span>
              <span className="flex-1 text-sm text-foreground group-hover:text-[#00823F] transition-colors">{ing}</span>
              <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-[#00823F] shrink-0 transition-colors" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
