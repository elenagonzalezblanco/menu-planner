import { useState, useRef, KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import { useRecipes, useCreateRecipe, useDeleteRecipe, useUpdateRecipe } from "@/hooks/use-recipes";
import { Plus, Search, ChefHat, Trash2, Pencil, Utensils, X, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import type { Recipe } from "@/lib/recipes-storage";

type Category = "primero" | "segundo" | "otro";

interface RecipeFormState {
  name: string;
  category: Category;
  ingredients: string[];
  instructions: string;
}

const EMPTY_FORM: RecipeFormState = {
  name: "",
  category: "segundo",
  ingredients: [],
  instructions: "",
};

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

export default function RecipesPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const { data: recipes = [], isLoading } = useRecipes();
  const createRecipe = useCreateRecipe();
  const deleteRecipe = useDeleteRecipe();
  const updateRecipe = useUpdateRecipe();
  const { toast } = useToast();

  const filteredRecipes = (recipes as Recipe[]).filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.ingredients.some(i => i.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCat = activeCategory ? r.category === activeCategory : true;
    return matchesSearch && matchesCat;
  });

  const handleDelete = (id: string, name: string) => {
    if (confirm(`¿Seguro que quieres borrar "${name}"?`)) {
      deleteRecipe.mutate(id, {
        onSuccess: () => toast({ title: "Receta eliminada" }),
      });
    }
  };

  const handleSave = (formData: RecipeFormState) => {
    if (editingRecipe) {
      updateRecipe.mutate(
        { id: editingRecipe.id, input: { ...formData, instructions: formData.instructions || "" } },
        {
          onSuccess: () => {
            setEditingRecipe(null);
            toast({ title: "Receta actualizada", description: formData.name });
          },
          onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
        }
      );
    } else {
      createRecipe.mutate(
        { ...formData, instructions: formData.instructions || "" },
        {
          onSuccess: () => {
            setIsCreating(false);
            toast({ title: "Receta añadida", description: formData.name });
          },
          onError: () => toast({ title: "Error al guardar", variant: "destructive" }),
        }
      );
    }
  };

  const openEdit = (recipe: Recipe) => setEditingRecipe(recipe);

  const counts = {
    primero: (recipes as Recipe[]).filter(r => r.category === "primero").length,
    segundo: (recipes as Recipe[]).filter(r => r.category === "segundo").length,
    otro: (recipes as Recipe[]).filter(r => r.category === "otro").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-4xl font-display font-bold text-foreground">Mis Recetas</h1>
          <p className="text-muted-foreground mt-1 text-lg">{(recipes as Recipe[]).length} recetas en tu colección</p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="rounded-xl px-6 bg-primary hover:bg-primary/90 shadow-md shadow-primary/20 gap-2"
        >
          <Plus className="w-4 h-4" /> Añadir Receta
        </Button>
      </div>

      {/* Search + filters */}
      <div className="bg-card rounded-2xl border border-border/50 shadow-sm p-2 flex flex-col sm:flex-row gap-2 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 rounded-xl border-none bg-transparent shadow-none focus-visible:ring-0"
            placeholder="Buscar por nombre o ingrediente..."
          />
        </div>
        <div className="flex gap-2 shrink-0">
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
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-muted/40 animate-pulse" />
          ))}
        </div>
      ) : filteredRecipes.length === 0 ? (
        <div className="text-center py-20 flex flex-col items-center bg-card/50 rounded-3xl border border-dashed border-border">
          <ChefHat className="w-14 h-14 text-muted-foreground/25 mb-4" />
          <h3 className="text-xl font-display font-semibold text-foreground">Sin resultados</h3>
          <p className="text-muted-foreground mt-2">Prueba con otra búsqueda o categoría.</p>
        </div>
      ) : (
        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredRecipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                onEdit={() => openEdit(recipe)}
                onDelete={() => handleDelete(recipe.id, recipe.name)}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Edit dialog */}
      <RecipeDialog
        key={editingRecipe?.id ?? "edit"}
        open={!!editingRecipe}
        onOpenChange={open => { if (!open) setEditingRecipe(null); }}
        title="Editar receta"
        initialValues={editingRecipe ? {
          name: editingRecipe.name,
          category: editingRecipe.category as Category,
          ingredients: editingRecipe.ingredients,
          instructions: editingRecipe.instructions ?? "",
        } : EMPTY_FORM}
        isPending={updateRecipe.isPending}
        onSave={handleSave}
      />

      {/* Create dialog */}
      <RecipeDialog
        key="create"
        open={isCreating}
        onOpenChange={open => { if (!open) setIsCreating(false); }}
        title="Nueva receta"
        initialValues={EMPTY_FORM}
        isPending={createRecipe.isPending}
        onSave={handleSave}
      />
    </div>
  );
}

// ── Recipe Card ──
function RecipeCard({ recipe, onEdit, onDelete }: {
  recipe: Recipe;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const cat = recipe.category as Category;
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? recipe.ingredients : recipe.ingredients.slice(0, 6);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="bg-card rounded-2xl border border-border/50 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden"
    >
      {/* Card header */}
      <div className="px-5 pt-5 pb-4 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border mb-2",
            CATEGORY_COLORS[cat]
          )}>
            {CATEGORY_LABELS[cat]}
          </span>
          <h3 className="text-lg font-display font-bold text-foreground leading-snug">{recipe.name}</h3>
        </div>
        <div className="flex gap-1 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10"
            onClick={onEdit}
            title="Editar receta"
          >
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={onDelete}
            title="Eliminar receta"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Ingredients */}
      <div className="px-5 pb-5 flex-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
          <Utensils className="w-3 h-3" /> Ingredientes
        </p>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground/60 italic">Sin ingredientes</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5">
              {shown.map((ing, i) => (
                <span key={i} className="text-xs bg-muted px-2.5 py-1 rounded-lg text-foreground/80 border border-border/30">
                  {ing}
                </span>
              ))}
            </div>
            {recipe.ingredients.length > 6 && (
              <button
                onClick={() => setExpanded(e => !e)}
                className="mt-2 text-xs text-primary hover:text-primary/80 font-medium"
              >
                {expanded ? "Ver menos" : `+${recipe.ingredients.length - 6} más`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Instructions preview */}
      {recipe.instructions && (
        <div className="px-5 pb-4 border-t border-border/40 pt-3">
          <p className="text-xs text-muted-foreground line-clamp-2">{recipe.instructions}</p>
        </div>
      )}
    </motion.div>
  );
}

// ── Recipe Dialog ──
function RecipeDialog({ open, onOpenChange, title, initialValues, isPending, onSave }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  initialValues: RecipeFormState;
  isPending: boolean;
  onSave: (data: RecipeFormState) => void;
}) {
  const [name, setName] = useState(initialValues.name);
  const [category, setCategory] = useState<Category>(initialValues.category);
  const [ingredients, setIngredients] = useState<string[]>(initialValues.ingredients);
  const [instructions, setInstructions] = useState(initialValues.instructions);
  const [ingredientInput, setIngredientInput] = useState("");
  const ingredientRef = useRef<HTMLInputElement>(null);

  const addIngredient = () => {
    const val = ingredientInput.trim();
    if (!val) return;
    const parts = val.split(",").map(s => s.trim()).filter(Boolean);
    setIngredients(prev => [...prev, ...parts.filter(p => !prev.includes(p))]);
    setIngredientInput("");
  };

  const removeIngredient = (i: number) => setIngredients(prev => prev.filter((_, idx) => idx !== i));

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addIngredient();
    }
    if (e.key === "Backspace" && ingredientInput === "" && ingredients.length > 0) {
      setIngredients(prev => prev.slice(0, -1));
    }
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), category, ingredients, instructions });
  };

  const isValid = name.trim().length >= 2 && ingredients.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] rounded-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-0">
          <DialogTitle className="font-display text-2xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Name */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Nombre del plato *</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              className="rounded-xl bg-muted/40 border-border/50 focus:bg-background"
              placeholder="Ej. Tortilla de patatas"
              autoFocus
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Categoría *</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["primero", "segundo", "otro"] as Category[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={cn(
                    "px-3 py-2.5 rounded-xl text-sm font-medium border transition-all",
                    category === cat
                      ? CATEGORY_COLORS[cat] + " shadow-sm"
                      : "border-border/50 text-muted-foreground hover:bg-muted"
                  )}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {category === "primero" && "Sopas, cremas, ensaladas, arroces — pueden usarse como primer plato"}
              {category === "segundo" && "Carnes, pescados, platos principales"}
              {category === "otro" && "Guarniciones, huevos, sándwiches, postres, varios"}
            </p>
          </div>

          {/* Ingredients tag input */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Ingredientes *</Label>
            <div
              className="min-h-[80px] rounded-xl border border-border/50 bg-muted/40 p-3 flex flex-wrap gap-1.5 cursor-text focus-within:border-primary/50 focus-within:bg-background transition-colors"
              onClick={() => ingredientRef.current?.focus()}
            >
              {ingredients.map((ing, i) => (
                <span key={i} className="flex items-center gap-1 bg-background border border-border/60 text-sm px-2.5 py-1 rounded-lg text-foreground/90 group">
                  {ing}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); removeIngredient(i); }}
                    className="text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
                ref={ingredientRef}
                value={ingredientInput}
                onChange={e => setIngredientInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={addIngredient}
                placeholder={ingredients.length === 0 ? "Escribe y pulsa Enter o coma para añadir..." : "Añadir más..."}
                className="flex-1 min-w-[140px] bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
              />
            </div>
            <p className="text-xs text-muted-foreground">Pulsa Enter o coma para añadir. Backspace para borrar el último.</p>
          </div>

          {/* Instructions */}
          <div className="space-y-1.5">
            <Label className="text-sm font-semibold">Instrucciones / Notas <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="rounded-xl bg-muted/40 border-border/50 focus:bg-background min-h-[80px] resize-none"
              placeholder="Pasos de preparación, tiempos, trucos..."
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/40 gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isPending || !isValid}
            className="rounded-xl px-6 gap-2"
          >
            {isPending ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
            ) : (
              <><Check className="w-4 h-4" /> Guardar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
