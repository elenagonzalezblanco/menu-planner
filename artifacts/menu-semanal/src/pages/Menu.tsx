import { useState, useCallback, useRef, useEffect } from "react";
import { useMenus, useGenerateMenu } from "@/hooks/use-menus";
import { useRecipes } from "@/hooks/use-recipes";
import { useGenerateShoppingList } from "@/hooks/use-shopping";
import { useUser } from "@/contexts/UserContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { chatWithMenuAgent, type ChatMessage } from "@/services/ai-menu";
import type { DayMenu } from "@workspace/api-client-react";
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
  Mail,
  Bookmark,
  Trash2,
  Bot,
  Send,
  MessageCircle,
  Shuffle,
  Settings,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListMenusQueryKey, getGetShoppingListQueryKey } from "@workspace/api-client-react";
import type { WeeklyMenu, DayMenu as ApiDayMenu } from "@workspace/api-client-react";
import { saveMenuToProfile, listSavedMenus, deleteSavedMenu, type SavedMenu } from "@/lib/menus-storage";
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

function parseSlotId(id: string): { dayIdx: number; meal: MealType; slot: SlotType } | null {
  const parts = id.split(":");
  if (parts.length !== 3) return null;
  return { dayIdx: parseInt(parts[0]), meal: parts[1] as MealType, slot: parts[2] as SlotType };
}

export default function MenuPage() {
  const { data: menus = [], isLoading } = useMenus();
  const { data: recipesData = [] } = useRecipes();
  const generateShopping = useGenerateShoppingList();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const generateMenu = useGenerateMenu();
  const { currentUser } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [localDays, setLocalDays] = useState<DayPlan[] | null>(null);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [showPrint, setShowPrint] = useState(false);
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLabel, setSaveLabel] = useState("");
  const [savedMenus, setSavedMenus] = useState<SavedMenu[]>(() => {
    const uid = currentUser?.id ? String(currentUser.id) : null;
    return uid ? listSavedMenus(uid) : [];
  });
  // ── AI Chat state ──
  const [chatMode, setChatMode] = useState<"random" | "ai">("random");
  const [aiMessages, setAiMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [pendingAiMenu, setPendingAiMenu] = useState<DayMenu[] | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const recipes = recipesData as unknown as Recipe[];
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const displayDays = (isEditing ? localDays : latestMenu?.days) as DayPlan[] | null | undefined;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const sendMenuByEmail = async () => {
    if (!latestMenu || !displayDays) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    try {
      const res = await fetch(`${API_URL}/api/email/menu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": String(currentUser?.id ?? ""),
        },
        body: JSON.stringify({ days: displayDays }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al enviar");
      }
      toast({ title: "Email enviado", description: "Revisa tu bandeja de entrada." });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast({ title: msg, variant: "destructive" });
    }
  };

  const handleSaveMenu = () => {
    if (!latestMenu || !displayDays) return;
    const uid = currentUser?.id ? String(currentUser.id) : null;
    if (!uid) return;
    const label = saveLabel.trim() || `Menú del ${new Date().toLocaleDateString('es-ES')}`;
    saveMenuToProfile(uid, displayDays as any, label);
    setSavedMenus(listSavedMenus(uid));
    setSaveLabel("");
    setShowSaveDialog(false);
    toast({ title: "Menú guardado", description: `"${label}" guardado en tu cuenta.` });
  };

  const handleDeleteSavedMenu = (id: string) => {
    const uid = currentUser?.id ? String(currentUser.id) : null;
    if (!uid) return;
    deleteSavedMenu(uid, id);
    setSavedMenus(listSavedMenus(uid));
    toast({ title: "Menú eliminado" });
  };

  const sendSavedMenuByEmail = async (menu: SavedMenu) => {
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    try {
      const res = await fetch(`${API_URL}/api/email/menu`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": String(currentUser?.id ?? ""),
        },
        body: JSON.stringify({ days: menu.days, subject: `Menú: ${menu.label}` }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Error al enviar");
      }
      toast({ title: "Email enviado", description: `"${menu.label}" enviado.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error";
      toast({ title: msg, variant: "destructive" });
    }
  };

  // ── AI Chat handlers ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  const handleAiSend = async () => {
    const text = aiInput.trim();
    if (!text || aiLoading) return;
    const azureEndpoint = currentUser?.azureEndpoint || import.meta.env.VITE_AZURE_ENDPOINT;
    const azureDeployment = currentUser?.azureDeployment || import.meta.env.VITE_AZURE_DEPLOYMENT || "gpt-4o";
    const azureApiKey = currentUser?.azureApiKey || import.meta.env.VITE_AZURE_API_KEY;
    if (!azureEndpoint || !azureApiKey) {
      toast({
        title: "Falta la configuración de Azure OpenAI",
        description: "Configura el endpoint y la API Key en el icono ⚙️ de ajustes del perfil.",
        variant: "destructive",
      });
      return;
    }
    const newMessages: ChatMessage[] = [...aiMessages, { role: "user", content: text }];
    setAiMessages(newMessages);
    setAiInput("");
    setAiLoading(true);
    try {
      const result = await chatWithMenuAgent(azureEndpoint, azureDeployment, azureApiKey, newMessages, recipes as any);
      setAiMessages([...newMessages, { role: "assistant", content: result.text }]);
      if (result.menu) {
        setPendingAiMenu(result.menu);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setAiMessages([...newMessages, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplyAiMenu = async () => {
    if (!pendingAiMenu) return;
    const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
    try {
      const res = await fetch(`${API_URL}/api/menus`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": String(currentUser?.id ?? ""),
        },
        body: JSON.stringify({ days: pendingAiMenu }),
      });
      if (!res.ok) throw new Error("Failed to save menu");
      await queryClient.invalidateQueries({ queryKey: getListMenusQueryKey() });
      setPendingAiMenu(null);
      toast({ title: "¡Menú aplicado!", description: "El menú del asistente IA está listo." });
    } catch {
      toast({ title: "Error al guardar el menú", variant: "destructive" });
    }
  };

  const handleCreateShoppingList = (menuId: number) => {    generateShopping.mutate({ data: { menuId } }, {
      onSuccess: () => {
        toast({ title: "Lista generada", description: "Lista de compra consolidada." });
        setLocation("/shopping");
      },
    });
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
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";
      const res = await fetch(`${API_URL}/api/menus/${latestMenu.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": String(currentUser?.id ?? ""),
        },
        body: JSON.stringify({ days: updatedDays }),
      });
      if (!res.ok) throw new Error("Failed to save");
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
                  className="rounded-xl px-4 border-border/60 gap-2"
                  onClick={sendMenuByEmail}
                >
                  <Mail className="w-4 h-4" />
                  Enviar por email
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl px-4 border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20 gap-2"
                  onClick={() => { setSaveLabel(`Menú del ${new Date().toLocaleDateString('es-ES')}`); setShowSaveDialog(true); }}
                >
                  <Bookmark className="w-4 h-4" />
                  Guardar menú
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

        {/* ── GENERATE MENU PANEL ── */}
        <div className="bg-card rounded-2xl border border-border/50 shadow-sm overflow-hidden">
          {/* Mode toggle tabs */}
          <div className="flex border-b border-border/50">
            <button
              onClick={() => setChatMode("random")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                chatMode === "random"
                  ? "bg-primary/5 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Shuffle className="w-4 h-4" />
              Generar aleatorio
            </button>
            <button
              onClick={() => setChatMode("ai")}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                chatMode === "ai"
                  ? "bg-primary/5 text-primary border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Bot className="w-4 h-4" />
              Asistente IA
            </button>
          </div>

          {/* Random mode */}
          {chatMode === "random" && (
            <div className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-foreground">¿Quieres un menú nuevo?</p>
                <p className="text-sm text-muted-foreground">Genera un menú semanal aleatorio basado en tus recetas.</p>
              </div>
              <Button
                onClick={() => generateMenu.mutate({ data: {} })}
                disabled={generateMenu.isPending}
                className="rounded-xl px-5 gap-2 bg-primary hover:bg-primary/90 shrink-0"
              >
                {generateMenu.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Generando...</>
                ) : (
                  <>🎲 Generar nuevo menú</>
                )}
              </Button>
            </div>
          )}

          {/* AI Chat mode */}
          {chatMode === "ai" && (
            <div className="flex flex-col">
              {/* API key warning — solo si tampoco hay env vars configurados */}
              {(!currentUser?.azureEndpoint || !currentUser?.azureApiKey) && (!import.meta.env.VITE_AZURE_ENDPOINT || !import.meta.env.VITE_AZURE_API_KEY) && (
                <div className="mx-4 mt-4 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl flex items-start gap-2 text-sm text-amber-800 dark:text-amber-300">
                  <Settings className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    Configura tu endpoint y API Key de Azure OpenAI en los{" "}
                    <strong>ajustes del perfil</strong> (icono ⚙️) para usar el asistente.
                  </span>
                </div>
              )}

              {/* Chat messages */}
              <div className="h-64 overflow-y-auto px-4 py-3 flex flex-col gap-3">
                {aiMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
                    <MessageCircle className="w-8 h-8 opacity-30" />
                    <p className="text-sm text-center">
                      Dile al asistente cómo quieres el menú.<br />
                      <span className="text-xs opacity-70">Ej: "pon solo segundos en la comida" o "sin carne los martes"</span>
                    </p>
                  </div>
                )}
                {aiMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                        <Bot className="w-3.5 h-3.5 text-primary" />
                      </div>
                    )}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      }`}
                    >
                      {/* Hide raw JSON block in assistant messages */}
                      {msg.role === "assistant"
                        ? msg.content.replace(/<MENU>[\s\S]*?<\/MENU>/g, "").trim()
                        : msg.content}
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                      <Bot className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-3.5 py-2.5">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Apply menu button */}
              {pendingAiMenu && (
                <div className="mx-4 mb-3 p-3 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-green-800 dark:text-green-300">
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>El asistente ha generado un menú. ¿Aplicarlo?</span>
                  </div>
                  <Button
                    size="sm"
                    className="rounded-lg bg-green-600 hover:bg-green-700 text-white shrink-0 gap-1.5"
                    onClick={handleApplyAiMenu}
                  >
                    <Check className="w-3.5 h-3.5" />
                    Aplicar menú
                  </Button>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 flex gap-2">
                <Textarea
                  placeholder="Escribe tus instrucciones para el menú..."
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleAiSend();
                    }
                  }}
                  className="rounded-xl resize-none text-sm min-h-[44px] max-h-24"
                  rows={2}
                  disabled={aiLoading}
                />
                <Button
                  size="icon"
                  className="rounded-xl h-auto py-2 px-3 bg-primary hover:bg-primary/90 shrink-0 self-end"
                  onClick={handleAiSend}
                  disabled={aiLoading || !aiInput.trim()}
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Menu Content */}
        {!latestMenu ? (
          <div className="bg-card rounded-3xl p-10 md:p-16 text-center shadow-sm border border-border/50 flex flex-col items-center justify-center relative overflow-hidden">
            <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6 text-primary">
              <CalendarDays className="w-12 h-12" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-3">Genera tu menú semanal</h2>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Pulsa el botón para crear un menú equilibrado con tus recetas.
            </p>
            <Button
              size="lg"
              onClick={() => generateMenu.mutate({ data: {} })}
              disabled={generateMenu.isPending}
              className="rounded-xl px-8 bg-primary hover:bg-primary/90"
            >
              {generateMenu.isPending ? (
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
            days={(latestMenu.days ?? []) as unknown as DayPlan[]}
            onClose={() => setShowPrint(false)}
          />
        )}
      </AnimatePresence>

      {/* Save Menu Dialog */}
      <AnimatePresence>
        {showSaveDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowSaveDialog(false); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl border border-border/50 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center text-amber-600">
                  <Bookmark className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-foreground text-lg">Guardar menú</h2>
                  <p className="text-sm text-muted-foreground">Se guardará en tu cuenta</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground">Nombre del menú</label>
                <Input
                  value={saveLabel}
                  onChange={(e) => setSaveLabel(e.target.value)}
                  placeholder={`Menú del ${new Date().toLocaleDateString('es-ES')}`}
                  className="rounded-xl"
                  onKeyDown={(e) => e.key === "Enter" && handleSaveMenu()}
                  autoFocus
                />
              </div>
              <div className="flex gap-3 justify-end pt-1">
                <Button variant="outline" className="rounded-xl" onClick={() => setShowSaveDialog(false)}>
                  Cancelar
                </Button>
                <Button className="rounded-xl gap-2 bg-amber-600 hover:bg-amber-700 text-white" onClick={handleSaveMenu}>
                  <Bookmark className="w-4 h-4" />
                  Guardar
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Saved Menus Section */}
      {savedMenus.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex items-center gap-2">
            <Bookmark className="w-5 h-5 text-amber-600" />
            <h2 className="text-xl font-display font-bold text-foreground">Menús guardados</h2>
            <span className="text-sm text-muted-foreground ml-1">({savedMenus.length})</span>
          </div>
          <div className="space-y-3">
            {savedMenus.map((sm) => (
              <div key={sm.id} className="bg-card border border-border/50 rounded-2xl p-4 flex items-center justify-between gap-4 hover:shadow-sm transition-shadow">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground truncate">{sm.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(sm.savedAt).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg gap-1.5 border-border/60"
                    onClick={() => sendSavedMenuByEmail(sm)}
                  >
                    <Mail className="w-3.5 h-3.5" />
                    Enviar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteSavedMenu(sm.id)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
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
