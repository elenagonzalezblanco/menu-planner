import { useState, useCallback, useRef, useEffect } from "react";
import { useMenus, useGenerateMenu } from "@/hooks/use-menus";
import { useRecipes } from "@/hooks/use-recipes";
import { useGenerateShoppingList } from "@/hooks/use-shopping";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  CalendarDays,
  Sparkles,
  ShoppingBasket,
  ChevronRight,
  Pencil,
  Check,
  X,
  Plus,
  Loader2,
  Printer,
  GripVertical,
  Send,
  Bot,
  RotateCcw,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListMenusQueryKey, getGetShoppingListQueryKey } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

type SlotType = "primero" | "segundo" | "primero2" | "segundo2";
type MealType = "lunch" | "dinner";

interface Recipe {
  id: number;
  name: string;
  category: string;
}

interface MealPlan {
  primero: Recipe | null;
  segundo: Recipe | null;
  primero2?: Recipe | null;
  segundo2?: Recipe | null;
}

interface DayPlan {
  day: string;
  lunch: MealPlan;
  dinner: MealPlan;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  isLoading?: boolean;
}

function parseSlotId(id: string): { dayIdx: number; meal: MealType; slot: SlotType } | null {
  const parts = id.split(":");
  if (parts.length !== 3) return null;
  return { dayIdx: parseInt(parts[0]), meal: parts[1] as MealType, slot: parts[2] as SlotType };
}

const WELCOME_WITH_MENU =
  "Tu menú está listo. Dime si quieres cambiar algo — puedo ajustar platos concretos, cambiar días enteros, añadir más pescado, quitar los primeros de la comida... lo que necesites.";

const WELCOME_NO_MENU =
  `Todavía no tienes ningún menú. Cuéntame cómo lo quieres y lo genero ahora — por ejemplo: "genera el menú de esta semana con más pescado y sin primero a mediodía".`;

export default function MenuPage() {
  const { data: menus = [], isLoading } = useMenus();
  const { data: recipesData = [] } = useRecipes();
  const generateShopping = useGenerateShoppingList();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isEditing, setIsEditing] = useState(false);
  const [localDays, setLocalDays] = useState<DayPlan[] | null>(null);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);

  const recipes = recipesData as Recipe[];
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const displayDays = (isEditing ? localDays : latestMenu?.days) as DayPlan[] | null | undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Set welcome message when menu loads
  useEffect(() => {
    if (!isLoading && chatHistory.length === 0) {
      setChatHistory([
        { role: "assistant", content: latestMenu ? WELCOME_WITH_MENU : WELCOME_NO_MENU },
      ]);
    }
  }, [isLoading, !!latestMenu]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  const handleCreateShoppingList = (menuId: number) => {
    generateShopping.mutate(
      { data: { menuId } },
      {
        onSuccess: () => {
          toast({ title: "Lista generada", description: "Lista de compra consolidada." });
          setLocation("/shopping");
        },
      }
    );
  };

  const startEditing = () => {
    if (!latestMenu) return;
    setLocalDays(JSON.parse(JSON.stringify(latestMenu.days)));
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setLocalDays(null);
  };

  const saveMenu = async (updatedDays: DayPlan[]) => {
    if (!latestMenu) return;
    try {
      const res = await fetch(`/api/menus/${latestMenu.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: updatedDays }),
      });
      if (!res.ok) throw new Error("Error guardando");
      await queryClient.invalidateQueries({ queryKey: getListMenusQueryKey() });
    } catch {
      toast({ title: "Error al guardar", variant: "destructive" });
    }
  };

  const handleSlotChange = useCallback(
    async (dayIdx: number, meal: MealType, slot: SlotType, recipe: Recipe | null) => {
      if (!localDays) return;
      const slotKey = `${dayIdx}-${meal}-${slot}`;
      setSavingSlot(slotKey);
      const updated = localDays.map((d, i) => {
        if (i !== dayIdx) return d;
        return { ...d, [meal]: { ...d[meal], [slot]: recipe } };
      });
      setLocalDays(updated);
      await saveMenu(updated);
      setSavingSlot(null);
    },
    [localDays, latestMenu]
  );

  // ── Chat send ──
  const sendMessage = async (text?: string) => {
    const message = (text ?? chatInput).trim();
    if (!message || isChatLoading) return;

    setChatInput("");
    const userMsg: ChatMessage = { role: "user", content: message };
    const loadingMsg: ChatMessage = { role: "assistant", content: "", isLoading: true };
    const historyForApi = chatHistory.filter(m => !m.isLoading);

    setChatHistory(prev => [...prev, userMsg, loadingMsg]);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/menus/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: historyForApi.map(m => ({ role: m.role, content: m.content })),
          menuId: latestMenu?.id ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error del agente");

      const assistantMsg: ChatMessage = { role: "assistant", content: data.reply };

      setChatHistory(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [...withoutLoading, assistantMsg];
      });

      // If the AI updated the menu, refresh it
      if (data.updatedMenu) {
        await queryClient.invalidateQueries({ queryKey: getListMenusQueryKey() });
        if (isEditing) {
          setLocalDays(data.updatedMenu.days);
        }
        toast({ title: "Menú actualizado", description: data.reply.slice(0, 80) });
      }
    } catch (err: any) {
      setChatHistory(prev => {
        const withoutLoading = prev.filter(m => !m.isLoading);
        return [
          ...withoutLoading,
          { role: "assistant", content: `Lo siento, ha habido un error: ${err.message || "inténtalo de nuevo"}` },
        ];
      });
    } finally {
      setIsChatLoading(false);
    }
  };

  // ── Drag & Drop ──
  const handleDragStart = (event: DragStartEvent) => setActiveSlotId(event.active.id as string);

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      setActiveSlotId(null);
      const { active, over } = event;
      if (!over || active.id === over.id || !localDays) return;
      const src = parseSlotId(active.id as string);
      const dst = parseSlotId(over.id as string);
      if (!src || !dst) return;
      const srcRecipe = localDays[src.dayIdx]?.[src.meal]?.[src.slot];
      const dstRecipe = localDays[dst.dayIdx]?.[dst.meal]?.[dst.slot];
      if (!srcRecipe) return;
      const updated = localDays.map((d, i) => {
        let result = d;
        if (i === src.dayIdx) result = { ...result, [src.meal]: { ...result[src.meal], [src.slot]: dstRecipe } };
        if (i === dst.dayIdx) result = { ...result, [dst.meal]: { ...result[dst.meal], [dst.slot]: srcRecipe } };
        return result;
      });
      setLocalDays(updated);
      await saveMenu(updated);
      toast({ title: "Plato movido", description: `${srcRecipe.name} → ${localDays[dst.dayIdx].day}` });
    },
    [localDays, latestMenu]
  );

  const activeRecipe = (() => {
    if (!activeSlotId || !displayDays) return null;
    const parsed = parseSlotId(activeSlotId);
    if (!parsed) return null;
    return displayDays[parsed.dayIdx]?.[parsed.meal]?.[parsed.slot] ?? null;
  })();

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-8">
        <div className="h-12 w-64 bg-muted rounded-xl" />
        <div className="h-64 w-full bg-card rounded-3xl" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-display font-bold text-foreground">Menú Semanal</h1>
            <p className="text-muted-foreground mt-1 text-lg">Tu agente personal de cocina</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {latestMenu && !isEditing && (
              <>
                <Button
                  variant="outline"
                  className="rounded-xl px-4 border-border/60 gap-2"
                  onClick={startEditing}
                >
                  <Pencil className="w-4 h-4" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl px-4 border-border/60 gap-2"
                  onClick={() => setShowPrint(true)}
                >
                  <Printer className="w-4 h-4" />
                  Imprimir
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl px-4 border-primary/20 text-primary hover:bg-primary/5"
                  onClick={() => handleCreateShoppingList(latestMenu.id)}
                  disabled={generateShopping.isPending}
                >
                  <ShoppingBasket className="w-4 h-4 mr-1.5" />
                  {generateShopping.isPending ? "Generando..." : "Lista de Compra"}
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button variant="outline" className="rounded-xl px-4 gap-2" onClick={cancelEditing}>
                  <X className="w-4 h-4" /> Cancelar
                </Button>
                <Button
                  className="rounded-xl px-4 gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => { setIsEditing(false); setLocalDays(null); toast({ title: "Guardado" }); }}
                >
                  <Check className="w-4 h-4" /> Listo
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Edit mode banner */}
        <AnimatePresence>
          {isEditing && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3 flex items-center gap-3 text-sm text-primary"
            >
              <GripVertical className="w-4 h-4 shrink-0" />
              <span>Modo edición — haz clic en un plato para cambiarlo o <strong>arrastra</strong> para moverlo entre días.</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── CHAT PANEL ── */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          {/* Chat header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground text-sm">Agente de menú</p>
                <p className="text-xs text-muted-foreground">
                  {isChatLoading ? "Pensando..." : "Listo para ayudarte"}
                </p>
              </div>
              {isChatLoading && <Loader2 className="w-3.5 h-3.5 text-primary animate-spin ml-1" />}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground gap-1.5 rounded-lg hover:text-foreground"
              disabled={isChatLoading}
              onClick={async () => {
                if (latestMenu) {
                  if (!confirm("¿Seguro? Esto borrará el menú, la lista de la compra y empezará desde cero.")) return;
                  try {
                    // Borrar TODOS los menús acumulados
                    await fetch("/api/menus", { method: "DELETE" });
                    // Limpiar todos los ingredientes manuales del localStorage
                    Object.keys(localStorage)
                      .filter(k => k.startsWith("extra-ingredients-"))
                      .forEach(k => localStorage.removeItem(k));
                    // Invalidar toda la caché
                    await queryClient.invalidateQueries({ queryKey: getListMenusQueryKey() });
                    queryClient.removeQueries({ queryKey: getGetShoppingListQueryKey(latestMenu.id) });
                    if (isEditing) cancelEditing();
                  } catch {
                    toast({ title: "Error al borrar el menú", variant: "destructive" });
                    return;
                  }
                }
                setChatHistory([{ role: "assistant", content: WELCOME_NO_MENU }]);
              }}
              title="Nueva conversación"
            >
              <RotateCcw className="w-3 h-3" />
              Nueva conversación
            </Button>
          </div>

          {/* Chat messages */}
          <div className="flex flex-col gap-3 px-5 py-4 overflow-y-auto" style={{ maxHeight: "340px" }}>
            {chatHistory.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}

            {/* Suggestions (only after welcome message) */}
            {chatHistory.length === 1 && chatHistory[0].role === "assistant" && !latestMenu && (
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  "Genera el menú de esta semana",
                  "Quiero más pescado esta semana",
                  "Sin primero en la comida",
                  "Menú con verduras y poca carne",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs bg-primary/8 hover:bg-primary/15 text-primary border border-primary/20 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {chatHistory.length === 1 && chatHistory[0].role === "assistant" && latestMenu && (
              <div className="flex flex-wrap gap-2 mt-1">
                {[
                  "Cambia el martes, quiero merluza",
                  "Quita los primeros de la comida",
                  "Más pescado esta semana",
                  "El jueves pon algo ligero",
                  "Regenera el menú completo",
                ].map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-xs bg-primary/8 hover:bg-primary/15 text-primary border border-primary/20 rounded-full px-3 py-1.5 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-border/50 px-4 py-3 flex gap-2 items-end bg-background/50">
            <Textarea
              ref={chatTextareaRef}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Escribe algo... ej. &quot;Pon merluza el martes de segundo&quot;, &quot;Sin primero a mediodía&quot;, &quot;Genera el menú&quot;"
              className="min-h-[44px] max-h-[120px] resize-none rounded-xl text-sm border-border/50 bg-background flex-1"
              disabled={isChatLoading}
              rows={1}
            />
            <Button
              onClick={() => sendMessage()}
              disabled={!chatInput.trim() || isChatLoading}
              size="icon"
              className="w-10 h-10 rounded-xl bg-primary hover:bg-primary/90 shrink-0"
            >
              {isChatLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Menu Content */}
        {!latestMenu ? (
          <div className="bg-card rounded-3xl p-10 md:p-16 text-center shadow-sm border border-border/50 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
              <CalendarDays className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-3">Usa el chat para generar tu menú</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Escribe en el chat de arriba cómo quieres el menú. Por ejemplo: "genera el menú de esta semana con más pescado y sin primero a mediodía".
            </p>
            <Button
              size="lg"
              onClick={() => sendMessage("Genera el menú de esta semana")}
              disabled={isChatLoading}
              className="rounded-xl px-8 bg-primary hover:bg-primary/90"
            >
              {isChatLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Generando...</>
              ) : (
                <>Generar menú ahora <ChevronRight className="ml-2 w-5 h-5" /></>
              )}
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            <div className="grid gap-4">
              {(displayDays ?? []).map((dayPlan, index) => (
                <DayCard
                  key={index}
                  dayPlan={dayPlan}
                  dayIdx={index}
                  isEditing={isEditing}
                  recipes={recipes}
                  savingSlot={savingSlot}
                  onSlotChange={handleSlotChange}
                />
              ))}
            </div>
            <DragOverlay>
              {activeRecipe && (
                <div className="bg-background rounded-xl p-3 border border-primary/50 shadow-xl opacity-90 rotate-2">
                  <span className="font-medium text-foreground text-sm">{activeRecipe.name}</span>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Print Modal */}
      <AnimatePresence>
        {showPrint && latestMenu && (
          <PrintModal
            days={(latestMenu.days ?? []) as DayPlan[]}
            onClose={() => setShowPrint(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ── Chat bubble ──
function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-2.5 max-w-[88%]", isUser ? "ml-auto flex-row-reverse" : "mr-auto")}>
      {!isUser && (
        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="w-3.5 h-3.5 text-primary" />
        </div>
      )}
      <div
        className={cn(
          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-primary text-white rounded-tr-sm"
            : "bg-muted/60 text-foreground rounded-tl-sm"
        )}
      >
        {message.isLoading ? (
          <div className="flex gap-1 py-1 items-center">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
            <span className="w-2 h-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
          </div>
        ) : (
          message.content
        )}
      </div>
    </div>
  );
}

// ── Day Card ──
function DayCard({
  dayPlan, dayIdx, isEditing, recipes, savingSlot, onSlotChange,
}: {
  dayPlan: DayPlan; dayIdx: number; isEditing: boolean; recipes: Recipe[];
  savingSlot: string | null;
  onSlotChange: (dayIdx: number, meal: MealType, slot: SlotType, recipe: Recipe | null) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl p-0 overflow-hidden shadow-sm border border-border/50 flex flex-col md:flex-row hover:shadow-md transition-shadow"
    >
      <div className="bg-muted/40 md:w-44 p-5 flex flex-col justify-center border-b md:border-b-0 md:border-r border-border/50">
        <h3 className="font-display text-xl font-bold text-foreground capitalize">{dayPlan.day}</h3>
      </div>
      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border/50">
        <MealSection label="Comida" emoji="☀️" meal={dayPlan.lunch} dayIdx={dayIdx} mealType="lunch"
          isEditing={isEditing} recipes={recipes} savingSlot={savingSlot} onSlotChange={onSlotChange} />
        <MealSection label="Cena" emoji="🌙" meal={dayPlan.dinner} dayIdx={dayIdx} mealType="dinner"
          isEditing={isEditing} recipes={recipes} savingSlot={savingSlot} onSlotChange={onSlotChange} />
      </div>
    </motion.div>
  );
}

// ── Meal Section ──
function MealSection({
  label, emoji, meal, dayIdx, mealType, isEditing, recipes, savingSlot, onSlotChange,
}: {
  label: string; emoji: string; meal: MealPlan | null | undefined;
  dayIdx: number; mealType: MealType; isEditing: boolean; recipes: Recipe[];
  savingSlot: string | null;
  onSlotChange: (dayIdx: number, meal: MealType, slot: SlotType, recipe: Recipe | null) => void;
}) {
  if (!meal) return <div className="p-5"><div className="flex items-center gap-2 mb-3"><span>{emoji}</span><h4 className="font-semibold">{label}</h4></div></div>;

  const primeroRecipes = recipes.filter(r => r.category === "primero");
  const segundoRecipes = recipes.filter(r => r.category === "segundo" || r.category === "otro");
  const isDinner = mealType === "dinner";

  return (
    <div className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">{emoji}</span>
        <h4 className="font-semibold text-foreground">{label}</h4>
      </div>
      <div className="space-y-2">
        {/* Primero */}
        {meal.primero ? (
          <RecipeSlot label="Primero" recipe={meal.primero} slotId={`${dayIdx}:${mealType}:primero`}
            slotKey={`${dayIdx}-${mealType}-primero`} savingSlot={savingSlot} isEditing={isEditing}
            recipes={primeroRecipes} canClear labelClass="text-primary"
            onSelect={r => onSlotChange(dayIdx, mealType, "primero", r)}
            onClear={() => onSlotChange(dayIdx, mealType, "primero", null)} />
        ) : isEditing ? (
          <AddSlotButton label="Añadir primero" recipes={primeroRecipes}
            slotId={`${dayIdx}:${mealType}:primero`} slotKey={`${dayIdx}-${mealType}-primero`}
            savingSlot={savingSlot} onSelect={r => onSlotChange(dayIdx, mealType, "primero", r)} />
        ) : null}

        {/* Primero2 — solo en cena */}
        {isDinner && (meal.primero2 ? (
          <RecipeSlot label="Primero" recipe={meal.primero2} slotId={`${dayIdx}:dinner:primero2`}
            slotKey={`${dayIdx}-dinner-primero2`} savingSlot={savingSlot} isEditing={isEditing}
            recipes={primeroRecipes} canClear labelClass="text-primary"
            onSelect={r => onSlotChange(dayIdx, "dinner", "primero2", r)}
            onClear={() => onSlotChange(dayIdx, "dinner", "primero2", null)} />
        ) : (meal.primero && isEditing) ? (
          <AddSlotButton label="+ Añadir otro primero" recipes={primeroRecipes}
            slotId={`${dayIdx}:dinner:primero2`} slotKey={`${dayIdx}-dinner-primero2`}
            savingSlot={savingSlot} onSelect={r => onSlotChange(dayIdx, "dinner", "primero2", r)} secondary />
        ) : null)}

        {/* Segundo */}
        {meal.segundo ? (
          <RecipeSlot label="Segundo" recipe={meal.segundo} slotId={`${dayIdx}:${mealType}:segundo`}
            slotKey={`${dayIdx}-${mealType}-segundo`} savingSlot={savingSlot} isEditing={isEditing}
            recipes={segundoRecipes} canClear={isDinner} labelClass="text-muted-foreground"
            onSelect={r => onSlotChange(dayIdx, mealType, "segundo", r)}
            onClear={() => onSlotChange(dayIdx, mealType, "segundo", null)} />
        ) : isEditing ? (
          <AddSlotButton label="Añadir segundo" recipes={segundoRecipes}
            slotId={`${dayIdx}:${mealType}:segundo`} slotKey={`${dayIdx}-${mealType}-segundo`}
            savingSlot={savingSlot} onSelect={r => onSlotChange(dayIdx, mealType, "segundo", r)} />
        ) : null}

        {/* Segundo2 — solo en cena */}
        {isDinner && (meal.segundo2 ? (
          <RecipeSlot label="Segundo" recipe={meal.segundo2} slotId={`${dayIdx}:dinner:segundo2`}
            slotKey={`${dayIdx}-dinner-segundo2`} savingSlot={savingSlot} isEditing={isEditing}
            recipes={segundoRecipes} canClear labelClass="text-muted-foreground"
            onSelect={r => onSlotChange(dayIdx, "dinner", "segundo2", r)}
            onClear={() => onSlotChange(dayIdx, "dinner", "segundo2", null)} />
        ) : (meal.segundo && isEditing) ? (
          <AddSlotButton label="+ Añadir otro segundo" recipes={segundoRecipes}
            slotId={`${dayIdx}:dinner:segundo2`} slotKey={`${dayIdx}-dinner-segundo2`}
            savingSlot={savingSlot} onSelect={r => onSlotChange(dayIdx, "dinner", "segundo2", r)} secondary />
        ) : null)}
      </div>
    </div>
  );
}

// ── Recipe Slot ──
function RecipeSlot({
  label, recipe, slotId, slotKey, savingSlot, isEditing, recipes, canClear, labelClass, onSelect, onClear,
}: {
  label: string; recipe: Recipe; slotId: string; slotKey: string; savingSlot: string | null;
  isEditing: boolean; recipes: Recipe[]; canClear: boolean; labelClass: string;
  onSelect: (r: Recipe) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isSaving = savingSlot === slotKey;
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({ id: slotId });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: slotId });
  const setRef = (el: HTMLElement | null) => { setDragRef(el); setDropRef(el); };

  if (!isEditing) {
    return (
      <div ref={setRef} className={cn("bg-background rounded-xl p-3 border border-border/50 transition-colors", isOver && "border-primary/50 bg-primary/5")}>
        <span className={cn("text-xs font-semibold uppercase tracking-wide block mb-0.5", labelClass)}>{label}</span>
        <span className="font-medium text-foreground text-sm">{recipe.name}</span>
      </div>
    );
  }

  return (
    <div ref={setRef} className={cn("flex gap-1.5 rounded-xl transition-all", isOver && "ring-2 ring-primary/40 ring-offset-1", isDragging && "opacity-30")}>
      <button className="w-7 flex items-center justify-center text-muted-foreground hover:text-primary cursor-grab active:cursor-grabbing shrink-0 touch-none" {...listeners} {...attributes}>
        <GripVertical className="w-4 h-4" />
      </button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className={cn("flex-1 bg-background rounded-xl p-3 border text-left transition-all hover:border-primary/40 hover:bg-primary/5 group", isSaving ? "border-primary/30 bg-primary/5" : "border-border/50")}>
            <span className={cn("text-xs font-semibold uppercase tracking-wide block mb-0.5", labelClass)}>{label}</span>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground text-sm">{recipe.name}</span>
              {isSaving ? <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" /> : <Pencil className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />}
            </div>
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
          <Command>
            <CommandInput placeholder={`Buscar ${label.toLowerCase()}...`} />
            <CommandList className="max-h-64">
              <CommandEmpty>No hay recetas</CommandEmpty>
              <CommandGroup>
                {recipes.map(r => (
                  <CommandItem key={r.id} value={r.name} onSelect={() => { onSelect(r); setOpen(false); }}>
                    <Check className={cn("mr-2 h-4 w-4 shrink-0", recipe.id === r.id ? "opacity-100" : "opacity-0")} />
                    {r.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {canClear && (
        <button onClick={onClear} className="w-9 h-auto flex items-center justify-center rounded-xl border border-border/50 text-muted-foreground hover:text-destructive hover:border-destructive/30 hover:bg-destructive/5 transition-colors shrink-0">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// ── Add Slot Button ──
function AddSlotButton({ label, recipes, slotId, slotKey, savingSlot, onSelect, secondary }: {
  label: string; recipes: Recipe[]; slotId: string; slotKey: string; savingSlot: string | null;
  onSelect: (r: Recipe) => void; secondary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isSaving = savingSlot === slotKey;
  const { setNodeRef, isOver } = useDroppable({ id: slotId });
  return (
    <div ref={setNodeRef} className={cn("rounded-xl transition-all", isOver && "ring-2 ring-primary/40")}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "w-full rounded-xl border border-dashed transition-all flex items-center gap-2 text-sm",
              secondary
                ? "p-2 border-border/30 text-muted-foreground/60 hover:border-primary/30 hover:text-primary/70 hover:bg-primary/3 bg-transparent"
                : "p-3 bg-background/60 border-border/50 text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5"
            )}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className={cn("shrink-0", secondary ? "w-3 h-3" : "w-3.5 h-3.5")} />}
            {label}
          </button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-72" align="start">
          <Command>
            <CommandInput placeholder="Buscar receta..." />
            <CommandList className="max-h-64">
              <CommandEmpty>No hay recetas</CommandEmpty>
              <CommandGroup>
                {recipes.map(r => (
                  <CommandItem key={r.id} value={r.name} onSelect={() => { onSelect(r); setOpen(false); }}>{r.name}</CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Print Modal ──
function PrintModal({ days, onClose }: { days: DayPlan[]; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 print:hidden"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-2xl max-w-[1100px] w-full overflow-hidden"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/50">
          <h2 className="font-display font-bold text-xl">Vista de impresión</h2>
          <div className="flex gap-3">
            <Button onClick={() => window.print()} className="rounded-xl gap-2">
              <Printer className="w-4 h-4" /> Imprimir / Guardar PDF
            </Button>
            <Button variant="outline" onClick={onClose} className="rounded-xl"><X className="w-4 h-4" /></Button>
          </div>
        </div>
        <div className="overflow-auto p-6" style={{ maxHeight: "80vh" }}>
          <PrintCalendar days={days} />
        </div>
      </motion.div>
    </motion.div>
  );
}

function PrintCalendar({ days }: { days: DayPlan[] }) {
  return (
    <div id="print-calendar" style={{ fontFamily: "'Georgia', serif", backgroundColor: "#fff", padding: "20px", border: "1px solid #ddd", borderRadius: "8px" }}>
      <div style={{ textAlign: "center", marginBottom: "20px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 4px", color: "#1a1a1a" }}>Menú Semanal — La Cocina</h1>
        <p style={{ fontSize: "13px", color: "#666", margin: 0 }}>{new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{ width: "80px", border: "1px solid #ddd", padding: "8px 6px", backgroundColor: "#f5f5f5", fontSize: "11px" }}>&nbsp;</th>
            {days.map(d => (
              <th key={d.day} style={{ border: "1px solid #ddd", padding: "8px 6px", backgroundColor: "#E8602C", color: "white", fontSize: "13px", fontWeight: "bold", textAlign: "center" }}>{d.day}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <PrintRow label="☀️ Comida" sublabel="Primero" days={days} getValue={d => d.lunch?.primero?.name ?? "—"} bgColor="#fff8f0" labelColor="#d35400" />
          <PrintRow label="" sublabel="Segundo" days={days} getValue={d => d.lunch?.segundo?.name ?? "—"} bgColor="#fff8f0" labelColor="#7f8c8d" />
          <PrintRow label="🌙 Cena" sublabel="Primero" days={days} getValue={d => d.dinner?.primero?.name ?? "—"} bgColor="#f0f4ff" labelColor="#2563eb" />
          {days.some(d => d.dinner?.primero2) && (
            <PrintRow label="" sublabel="Primero 2" days={days} getValue={d => d.dinner?.primero2?.name ?? "—"} bgColor="#f0f4ff" labelColor="#2563eb" />
          )}
          <PrintRow label="" sublabel="Segundo" days={days} getValue={d => d.dinner?.segundo?.name ?? "—"} bgColor="#f0f4ff" labelColor="#7f8c8d" />
          {days.some(d => d.dinner?.segundo2) && (
            <PrintRow label="" sublabel="Segundo 2" days={days} getValue={d => d.dinner?.segundo2?.name ?? "—"} bgColor="#f0f4ff" labelColor="#7f8c8d" />
          )}
        </tbody>
      </table>
      <p style={{ fontSize: "11px", color: "#999", marginTop: "14px", textAlign: "center" }}>La Cocina — Menú generado con IA</p>
    </div>
  );
}

function PrintRow({ label, sublabel, days, getValue, bgColor, labelColor }: {
  label: string; sublabel: string; days: DayPlan[]; getValue: (d: DayPlan) => string;
  bgColor: string; labelColor: string;
}) {
  return (
    <tr>
      <td style={{ border: "1px solid #ddd", padding: "8px 6px", backgroundColor: "#f9f9f9", fontSize: "11px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", color: labelColor }}>
        {label && <div>{label}</div>}
        <div style={{ fontWeight: "normal", color: "#888", fontSize: "10px" }}>{sublabel}</div>
      </td>
      {days.map(d => {
        const value = getValue(d);
        return (
          <td key={d.day} style={{ border: "1px solid #ddd", padding: "7px 6px", backgroundColor: bgColor, fontSize: "12px", textAlign: "center", verticalAlign: "middle", color: value === "—" ? "#ccc" : "#1a1a1a", fontStyle: value === "—" ? "italic" : "normal" }}>
            {value}
          </td>
        );
      })}
    </tr>
  );
}
