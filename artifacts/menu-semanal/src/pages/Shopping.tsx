import { useShoppingList } from "@/hooks/use-shopping";
import { useMenus } from "@/hooks/use-menus";
import { useExtraIngredients } from "@/hooks/use-extra-ingredients";
import { useEmail } from "@/contexts/EmailContext";
import { Button } from "@/components/ui/button";
import { ShoppingBag, CheckCircle2, Store, Plus, X, Mail } from "lucide-react";
import { useLocation } from "wouter";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { WhatsAppSettings } from "@/components/WhatsAppSettings";
import { useWhatsAppIngredients } from "@/hooks/use-whatsapp";
import { useUser } from "@/contexts/UserContext";
import { useCartRequest } from "@/hooks/use-mercadona-cart";
import { AutoCartButton, AutoCartStatus } from "@/components/AutoCartRequest";

export default function ShoppingPage() {
  const { data: menus = [] } = useMenus();
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const { data: shoppingList, isLoading, isError } = useShoppingList(latestMenu?.id ?? 0);
  const { items: extraItems, add: addExtra, remove: removeExtra } = useExtraIngredients(latestMenu?.id);
  const { send: sendEmail, busy: emailBusy } = useEmail();
  const [, setLocation] = useLocation();
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [newIngredient, setNewIngredient] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const whatsapp = useWhatsAppIngredients();
  const { currentUser } = useUser();
  const cartRequest = useCartRequest(currentUser?.id);

  const toggleItem = (ingredient: string) => {
    const next = new Set(checkedItems);
    if (next.has(ingredient)) next.delete(ingredient);
    else next.add(ingredient);
    setCheckedItems(next);
  };

  const handleAdd = () => {
    const trimmed = newIngredient.trim();
    if (!trimmed) return;
    addExtra(trimmed);
    setNewIngredient("");
    inputRef.current?.focus();
  };

  const sendShoppingByEmail = () => {
    if (!shoppingList || isLoading || isError) {
      alert("Espera a que la lista de la compra se cargue correctamente antes de enviarla.");
      return;
    }
    sendEmail({ kind: "shopping", payload: { items: shoppingList.items, extraItems } });
  };

  const apiItems = shoppingList?.items ?? [];
  const totalCount = apiItems.length + extraItems.length;
  const checkedCount = [...checkedItems].filter(i =>
    apiItems.some((a: { ingredient: string }) => a.ingredient === i) || extraItems.includes(i)
  ).length;

  return (
    <div className="space-y-8 pb-20">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gradient-to-br from-secondary/20 to-secondary/5 p-8 rounded-3xl border border-secondary/20">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Lista de Compra</h1>
          <p className="text-muted-foreground mt-2 text-lg">Ingredientes consolidados para tu semana</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <AutoCartButton cart={cartRequest} />
          <Button
            onClick={sendShoppingByEmail}
            type="button"
            disabled={emailBusy || isLoading || isError || !shoppingList || (shoppingList.items.length === 0 && extraItems.length === 0)}
            variant="outline"
            className="rounded-xl px-6 gap-2"
            size="lg"
          >
            <Mail className="w-5 h-5" />
            {emailBusy ? "Procesando email…" : "Enviar por email"}
          </Button>
          <Button
            onClick={() => setLocation("/mercadona")}
            className="rounded-xl px-6 bg-secondary hover:bg-secondary/90 text-white shadow-lg shadow-secondary/30"
            size="lg"
          >
            <Store className="w-5 h-5 mr-2" />
            Cesta de Mercadona
          </Button>
          <Button
            onClick={() => setLocation("/carrefour")}
            className="rounded-xl px-6 bg-[#004E9B] hover:bg-[#003B77] text-white shadow-lg shadow-[#004E9B]/30"
            size="lg"
          >
            <Store className="w-5 h-5 mr-2" />
            Buscar en Carrefour
          </Button>
        </div>
      </div>

      <AutoCartStatus cart={cartRequest} />
      <WhatsAppSettings />
      {!latestMenu && <p className="text-sm text-muted-foreground">Puedes añadir productos desde WhatsApp sin generar un menú.</p>}
      {(isError || whatsapp.isError) && <p role="alert" className="text-destructive">No se pudo actualizar la lista. Comprueba la conexión y vuelve a intentarlo.</p>}
      {whatsapp.remove.isError && <p role="alert" className="text-destructive">{whatsapp.remove.error.message}</p>}
      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-16 bg-card rounded-xl animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border/50">
          {/* Counter */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-border/50">
            <span className="font-medium text-muted-foreground">
              {checkedCount} de {totalCount} artículos
            </span>
            <span className="text-sm px-3 py-1 bg-muted rounded-full">
              Semana {new Date().toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </span>
          </div>

          {/* API items */}
          <div className="space-y-2">
            {apiItems.map((item, i) => {
              const isChecked = checkedItems.has(item.ingredient);
              return (
                <div
                  key={i}
                  onClick={() => toggleItem(item.ingredient)}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all border animate-fade-slide-up",
                    isChecked
                      ? "bg-muted/30 border-transparent opacity-60"
                      : "bg-background border-border/50 hover:border-primary/30 hover:shadow-sm"
                  )}
                >
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0",
                    isChecked ? "bg-primary text-white" : "border-2 border-muted-foreground/30"
                  )}>
                    {isChecked && <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <span className={cn(
                      "text-lg font-medium transition-all",
                      isChecked ? "line-through text-muted-foreground" : "text-foreground"
                    )}>
                      {item.ingredient}
                    </span>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {item.recipes.map((recipe, idx) => (
                        <span key={idx} className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                          {recipe}
                        </span>
                      ))}
                    </div>
                    {whatsapp.data?.filter(extra =>
                      extra.ingredient.normalize("NFC").trim().toLocaleLowerCase("es").replace(/\s+/g, " ") === item.ingredient.normalize("NFC").trim().toLocaleLowerCase("es").replace(/\s+/g, " ")
                    ).map(extra => (
                      <button key={extra.id} type="button"
                        aria-label={`Quitar ${extra.ingredient} de WhatsApp`}
                        title="Quitar el añadido de WhatsApp; si lo necesita una receta, seguirá en la lista"
                        disabled={whatsapp.remove.isPending}
                        onClick={event => { event.stopPropagation(); whatsapp.remove.mutate(extra.id); }}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive disabled:opacity-40">
                        <X className="w-4 h-4" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Extra items */}
            {extraItems.map((ingredient, i) => {
              const isChecked = checkedItems.has(ingredient);
              return (
                <div
                  key={`extra-${i}`}
                  className={cn(
                    "flex items-center gap-4 p-4 rounded-2xl border transition-all animate-fade-slide-left",
                    isChecked
                      ? "bg-muted/30 border-transparent opacity-60"
                      : "bg-background border-border/50 hover:border-primary/30 hover:shadow-sm"
                  )}
                >
                  <div
                    onClick={() => toggleItem(ingredient)}
                    className={cn(
                      "w-6 h-6 rounded-full flex items-center justify-center transition-colors shrink-0 cursor-pointer",
                      isChecked ? "bg-primary text-white" : "border-2 border-muted-foreground/30"
                    )}
                  >
                    {isChecked && <CheckCircle2 className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 cursor-pointer" onClick={() => toggleItem(ingredient)}>
                    <span className={cn(
                      "text-lg font-medium transition-all",
                      isChecked ? "line-through text-muted-foreground" : "text-foreground"
                    )}>
                      {ingredient}
                    </span>
                    <div className="mt-1">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-primary/70 bg-primary/8 px-2 py-0.5 rounded-md">
                        añadido a mano
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => removeExtra(ingredient)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}

            {/* Empty state */}
            {totalCount === 0 && (
              <div className="text-center py-12">
                <ShoppingBag className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-display font-medium text-foreground">Tu lista está vacía</h3>
                <p className="text-muted-foreground text-sm mt-1">Genera la lista desde el Menú Semanal o añade ingredientes abajo</p>
              </div>
            )}
          </div>

          {/* Add manual ingredient */}
          {latestMenu && <div className="mt-6 pt-5 border-t border-border/50">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Añadir ingrediente</p>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newIngredient}
                onChange={e => setNewIngredient(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
                placeholder="Ej: Chocolate negro, Sal, Aceite..."
                className="flex-1 bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/40 focus:ring-1 focus:ring-primary/20 transition-all"
              />
              <button
                onClick={handleAdd}
                disabled={!newIngredient.trim()}
                className="px-4 py-2.5 bg-primary text-white rounded-xl text-sm font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <Plus className="w-4 h-4" />
                Añadir
              </button>
            </div>
          </div>}
        </div>
      )}
    </div>
  );
}
