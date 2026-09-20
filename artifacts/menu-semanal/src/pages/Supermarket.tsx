import { useShoppingList } from "@/hooks/use-shopping";
import { useMenus } from "@/hooks/use-menus";
import { useExtraIngredients } from "@/hooks/use-extra-ingredients";
import { cn } from "@/lib/utils";
import {
  buildSupermarketSearchUrl,
  supermarkets,
  type SupermarketId,
} from "@/lib/supermarkets";
import { ExternalLink, Store, ShoppingCart, Search } from "lucide-react";

export function SupermarketPage({ supermarketId }: { supermarketId: SupermarketId }) {
  const supermarket = supermarkets[supermarketId];
  const { data: menus = [] } = useMenus();
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const { data: shoppingList } = useShoppingList(latestMenu?.id ?? 0);
  const { items: extraItems } = useExtraIngredients(latestMenu?.id);

  const ingredients = [
    ...(shoppingList?.items.map((item: { ingredient: string }) => item.ingredient) ?? []),
    ...extraItems,
  ];

  if (!shoppingList) {
    return (
      <div className="space-y-5 pb-20 max-w-3xl mx-auto">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", supermarket.iconClassName)}>
              <Store className="w-5 h-5 text-white" />
            </div>
            {supermarket.name}
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
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", supermarket.iconClassName)}>
              <Store className="w-5 h-5 text-white" />
            </div>
            {supermarket.name}
          </h1>
          <p className="text-muted-foreground mt-1">
            {ingredients.length} ingredientes — haz clic en cada uno para buscarlo directamente en {supermarket.name}
          </p>
        </div>
        <a href={supermarket.storeUrl} target="_blank" rel="noreferrer">
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl border transition-colors text-sm font-medium",
            supermarket.linkClassName,
          )}>
            <ExternalLink className="w-4 h-4" />
            Abrir {supermarket.name}
          </div>
        </a>
      </div>

      <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-border/40 flex items-center gap-2">
          <Search className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Buscar en {supermarket.name}</span>
          <span className="ml-auto text-xs text-muted-foreground">{ingredients.length} ingredientes</span>
        </div>
        <div className="divide-y divide-border/30">
          {ingredients.map((ingredient, index) => (
            <a
              key={`${ingredient}-${index}`}
              href={buildSupermarketSearchUrl(supermarketId, ingredient)}
              target="_blank"
              rel="noreferrer"
              className={cn(
                "flex items-center gap-3 px-5 py-3.5 group transition-colors",
                supermarket.rowClassName,
              )}
            >
              <span className="text-xs text-muted-foreground/50 w-5 text-right shrink-0">{index + 1}</span>
              <span className={cn(
                "flex-1 text-sm text-foreground transition-colors",
                supermarket.ingredientClassName,
              )}>
                {ingredient}
              </span>
              <ExternalLink className={cn(
                "w-3.5 h-3.5 text-muted-foreground/40 shrink-0 transition-colors",
                supermarket.ingredientClassName,
              )} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
