import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { downloadRecipePdf } from "@/lib/recipe-pdf";
import { getRecipeImageUrl } from "@/lib/recipe-images";
import { Search, ChefHat, Utensils, FileDown, ListChecks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type Category = "primero" | "segundo" | "otro";

interface PublicRecipe {
  name: string;
  category: string;
  ingredients: string[];
  instructions: string;
}

const CATEGORY_LABELS: Record<Category, string> = {
  primero: "🥗 Primero",
  segundo: "🍖 Segundo",
  otro: "🍳 Otro",
};

const CATEGORY_COLORS: Record<Category, string> = {
  primero: "bg-blue-50 text-blue-700 border-blue-200",
  segundo: "bg-orange-50 text-orange-700 border-orange-200",
  otro: "bg-purple-50 text-purple-700 border-purple-200",
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export default function PublicRecipes() {
  const [recipes, setRecipes] = useState<PublicRecipe[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [nameTerm, setNameTerm] = useState("");
  const [ingredientTerm, setIngredientTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [viewing, setViewing] = useState<PublicRecipe | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/recipes`);
        if (!res.ok) throw new Error("fetch failed");
        const data: PublicRecipe[] = await res.json();
        if (!cancelled) setRecipes(data);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => ({
    primero: recipes.filter(r => r.category === "primero").length,
    segundo: recipes.filter(r => r.category === "segundo").length,
    otro: recipes.filter(r => r.category === "otro").length,
  }), [recipes]);

  const filtered = useMemo(() => {
    const n = norm(nameTerm.trim());
    const ing = norm(ingredientTerm.trim());
    return recipes.filter(r => {
      const matchesName = !n || norm(r.name).includes(n);
      const matchesIng = !ing || r.ingredients.some(i => norm(i).includes(ing));
      const matchesCat = activeCategory ? r.category === activeCategory : true;
      return matchesName && matchesIng && matchesCat;
    });
  }, [recipes, nameTerm, ingredientTerm, activeCategory]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 lg:py-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <ChefHat className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-foreground">Recetario</h1>
              <p className="text-muted-foreground">{recipes.length} recetas · busca por nombre, categoría o ingredientes</p>
            </div>
          </div>
        </div>

        {/* Search + filters */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-3 space-y-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={nameTerm}
                onChange={e => setNameTerm(e.target.value)}
                className="w-full pl-10 rounded-xl"
                placeholder="Buscar por nombre del plato..."
              />
            </div>
            <div className="relative flex-1">
              <Utensils className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={ingredientTerm}
                onChange={e => setIngredientTerm(e.target.value)}
                className="w-full pl-10 rounded-xl"
                placeholder="Buscar por ingrediente..."
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {(["primero", "segundo", "otro"] as Category[]).map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap border",
                  activeCategory === cat
                    ? CATEGORY_COLORS[cat] + " shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-muted"
                )}
              >
                {cat === "primero" ? "Primeros" : cat === "segundo" ? "Segundos" : "Otros"}
                <span className="ml-1.5 text-xs opacity-70">({counts[cat]})</span>
              </button>
            ))}
            {activeCategory && (
              <button
                onClick={() => setActiveCategory(null)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-primary hover:bg-primary/10"
              >
                Ver todas
              </button>
            )}
          </div>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-2" /> Cargando recetas...
          </div>
        ) : error ? (
          <div className="text-center py-20 bg-card/50 rounded-3xl border border-dashed border-border">
            <p className="text-muted-foreground">No se han podido cargar las recetas. Inténtalo de nuevo más tarde.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center bg-card/50 rounded-3xl border border-dashed border-border">
            <ChefHat className="w-14 h-14 text-muted-foreground/25 mb-4" />
            <h3 className="text-xl font-display font-semibold text-foreground">Sin resultados</h3>
            <p className="text-muted-foreground mt-2">Prueba con otra búsqueda o categoría.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((recipe, i) => (
              <PublicRecipeCard key={recipe.name + i} recipe={recipe} onView={() => setViewing(recipe)} />
            ))}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground/70 pt-4">Mi Cocina · Planificador de menús</p>
      </div>

      <PublicRecipeDetail recipe={viewing} onOpenChange={open => { if (!open) setViewing(null); }} />
    </div>
  );
}

function PublicRecipeCard({ recipe, onView }: { recipe: PublicRecipe; onView: () => void }) {
  const cat = recipe.category as Category;
  const imageUrl = getRecipeImageUrl(recipe.name);
  const hasInstructions = !!(recipe.instructions && recipe.instructions.trim());

  return (
    <div className="bg-card rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden">
      {imageUrl && (
        <button type="button" onClick={onView} className="block w-full overflow-hidden group" title="Ver receta">
          <img src={imageUrl} alt={recipe.name} loading="lazy" className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300" />
        </button>
      )}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <button type="button" onClick={onView} className="flex-1 min-w-0 text-left group">
          <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border mb-2", CATEGORY_COLORS[cat])}>
            {CATEGORY_LABELS[cat]}
          </span>
          <h3 className="text-lg font-display font-bold text-foreground leading-snug group-hover:text-primary transition-colors">{recipe.name}</h3>
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 shrink-0"
          onClick={() => { downloadRecipePdf(recipe).catch((e) => console.error(e)); }}
          title="Descargar PDF"
        >
          <FileDown className="w-3.5 h-3.5" />
        </Button>
      </div>
      <div className="px-5 pb-5 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <Utensils className="w-3 h-3" /> Ingredientes
        </p>
        <div className="flex flex-wrap gap-1.5">
          {recipe.ingredients.slice(0, 6).map((ing, i) => (
            <span key={i} className="text-xs bg-muted px-2.5 py-1 rounded-lg text-foreground/80 border border-border/30">{ing}</span>
          ))}
          {recipe.ingredients.length > 6 && (
            <span className="text-xs text-primary font-medium px-1 py-1">+{recipe.ingredients.length - 6} más</span>
          )}
        </div>
      </div>
      {hasInstructions && (
        <button type="button" onClick={onView} className="px-5 pb-4 border-t border-border/40 pt-3 text-left w-full hover:bg-muted/30 transition-colors">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
            <ListChecks className="w-3 h-3" /> Preparación
          </p>
          <p className="text-xs text-muted-foreground line-clamp-2">{recipe.instructions}</p>
          <span className="text-xs text-primary font-medium mt-1 inline-block">Ver receta completa →</span>
        </button>
      )}
    </div>
  );
}

function PublicRecipeDetail({ recipe, onOpenChange }: { recipe: PublicRecipe | null; onOpenChange: (open: boolean) => void }) {
  if (!recipe) return null;
  const cat = recipe.category as Category;
  const imageUrl = getRecipeImageUrl(recipe.name);
  const hasInstructions = !!(recipe.instructions && recipe.instructions.trim());
  const steps = hasInstructions ? recipe.instructions.split(/\n+/).map(s => s.trim()).filter(Boolean) : [];

  return (
    <Dialog open={!!recipe} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <span className={cn("inline-flex items-center w-fit px-2.5 py-0.5 rounded-full text-xs font-semibold border mb-2", CATEGORY_COLORS[cat])}>
            {CATEGORY_LABELS[cat]}
          </span>
          <DialogTitle className="font-display text-2xl">{recipe.name}</DialogTitle>
        </DialogHeader>
        <div className="px-6 py-4 space-y-5 max-h-[60vh] overflow-y-auto">
          {imageUrl && (
            <img src={imageUrl} alt={recipe.name} loading="lazy" className="w-full h-48 object-cover rounded-xl border border-border/50" />
          )}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <Utensils className="w-3 h-3" /> Ingredientes
            </p>
            <ul className="space-y-1">
              {recipe.ingredients.map((ing, i) => (
                <li key={i} className="text-sm text-foreground/90 flex items-start gap-2">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  {ing}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <ListChecks className="w-3 h-3" /> Preparación
            </p>
            {hasInstructions ? (
              <div className="space-y-2">
                {steps.map((step, i) => (
                  <p key={i} className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">{step}</p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground/60 italic">Esta receta todavía no tiene instrucciones.</p>
            )}
          </div>
        </div>
        <DialogFooter className="px-6 py-4 border-t border-border/40">
          <Button type="button" onClick={() => { downloadRecipePdf(recipe).catch((e) => console.error(e)); }} className="rounded-xl px-6 gap-2">
            <FileDown className="w-4 h-4" /> Descargar PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
