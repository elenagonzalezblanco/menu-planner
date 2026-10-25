import { useEffect, useRef, useState } from "react";
import { useUser } from "@/contexts/UserContext";
import { useMenus } from "@/hooks/use-menus";
import {
  ConnectorAuthError, bookmarkletFor, createConnectorToken, readConnectorToken, storeConnectorToken,
  useCartPlan, useConnectorAction, useConnectorStatus, type CartPlan, type PlanConfidence,
} from "@/hooks/use-mercadona-cart";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bookmark, CheckCircle2, Copy, History, Link2Off, ShoppingCart, Sparkles, Trash2 } from "lucide-react";

const dateFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const formatDate = (value: string | null) => (value ? dateFormat.format(new Date(value)) : "—");

const confidenceStyles: Record<PlanConfidence, string> = {
  alta: "bg-emerald-100 text-emerald-800",
  media: "bg-amber-100 text-amber-800",
  baja: "bg-slate-100 text-slate-700",
};

export function MercadonaAutoCart() {
  const { currentUser } = useUser();
  return currentUser ? <AutoCart key={currentUser.id} userId={currentUser.id} /> : null;
}

function AutoCart({ userId }: { userId: number }) {
  const [token, setToken] = useState<string | null>(() => readConnectorToken(userId));
  const status = useConnectorStatus(token);

  useEffect(() => {
    if (status.error instanceof ConnectorAuthError) {
      storeConnectorToken(userId, null);
      setToken(null);
    }
  }, [status.error, userId]);

  const saveToken = (value: string | null) => {
    storeConnectorToken(userId, value);
    setToken(value);
  };

  return (
    <section className="rounded-3xl border border-[#00823F]/30 bg-gradient-to-br from-[#00823F]/10 to-transparent p-6 space-y-5" aria-label="Cesta automática de Mercadona">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#00823F] flex items-center justify-center shrink-0">
          <ShoppingCart className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-display font-bold text-foreground">Cesta automática</h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Mete en tu carro de Mercadona todos los ingredientes de todos los platos del menú que diseñas. Tus pedidos
            anteriores solo deciden qué producto sueles coger para cada ingrediente y cuánto por plato.
            Nada se compra solo: tú revisas el carro y decides.
          </p>
        </div>
      </div>
      {token ? (
        <ConnectedCart token={token} userId={userId} status={status} onDisconnect={() => saveToken(null)} />
      ) : (
        <ConnectForm userId={userId} onConnected={saveToken} />
      )}
    </section>
  );
}

function ConnectForm({ userId, onConnected }: { userId: number; onConnected: (token: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={async event => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          onConnected(await createConnectorToken(userId, password));
          setPassword("");
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "No se pudo conectar Mercadona.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="text-sm">
        Para leer tu historial de pedidos se usa un marcador del navegador que funciona dentro de tu sesión de Mercadona:
        tu contraseña de Mercadona nunca pasa por Mi Cocina. Confirma tu contraseña de <strong>Mi Cocina</strong> para crearlo.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor="mercadona-connector-password">Contraseña de Mi Cocina</label>
        <input
          id="mercadona-connector-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          placeholder="Contraseña de Mi Cocina"
          maxLength={1024}
          required
          className="flex-1 min-w-[220px] rounded-xl border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={!password || busy} className="rounded-xl bg-[#00823F] border-[#00823F] text-white">
          {busy ? "Conectando…" : "Conectar con Mercadona"}
        </Button>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </form>
  );
}

function BookmarkletLink({ token }: { token: string }) {
  const link = useRef<HTMLAnchorElement>(null);
  const [copied, setCopied] = useState(false);
  const bookmarklet = bookmarkletFor(token);

  // React refuses javascript: URLs in JSX, so the bookmark target is set on the DOM node.
  useEffect(() => {
    link.current?.setAttribute("href", bookmarklet);
  }, [bookmarklet]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <a
        ref={link}
        onClick={event => event.preventDefault()}
        draggable
        title="Arrástrame a la barra de marcadores"
        className="inline-flex items-center gap-2 rounded-full bg-[#00823F] px-4 py-2 text-sm font-semibold text-white shadow-md cursor-grab"
      >
        <Bookmark className="w-4 h-4" /> Mi Cocina → Mercadona
      </a>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-xl"
        onClick={async () => {
          await navigator.clipboard.writeText(bookmarklet);
          setCopied(true);
          setTimeout(() => setCopied(false), 2500);
        }}
      >
        <Copy className="w-4 h-4" /> {copied ? "Copiado" : "Copiar marcador"}
      </Button>
    </div>
  );
}

function ConnectedCart({ token, userId, status, onDisconnect }: {
  token: string;
  userId: number;
  status: ReturnType<typeof useConnectorStatus>;
  onDisconnect: () => void;
}) {
  const { data: menus = [] } = useMenus();
  const latestMenu = menus.length > 0 ? menus[0] : null;
  const planMutation = useCartPlan(token);
  const action = useConnectorAction(token);
  const history = status.data?.history;
  const latest = status.data?.latestPlan;
  const plan: CartPlan | null | undefined = planMutation.data ?? latest;

  return (
    <div className="space-y-5">
      <ol className="grid gap-3 sm:grid-cols-3 text-sm">
        <li className="rounded-2xl bg-card border border-border/60 p-4">
          <span className="font-semibold">1. Guarda el marcador</span>
          <p className="text-muted-foreground mt-1">Arrastra el botón verde a la barra de marcadores (en el móvil: «Copiar marcador» y créalo a mano).</p>
        </li>
        <li className="rounded-2xl bg-card border border-border/60 p-4">
          <span className="font-semibold">2. Púlsalo en Mercadona</span>
          <p className="text-muted-foreground mt-1">Con tu sesión iniciada en tienda.mercadona.es. Lee tus pedidos nuevos y llena el carro con tu menú semanal.</p>
        </li>
        <li className="rounded-2xl bg-card border border-border/60 p-4">
          <span className="font-semibold">3. Revisa el carro</span>
          <p className="text-muted-foreground mt-1">Quita o añade lo que quieras y pulsa «Añadir al pedido en curso» o «Tramitar nuevo pedido».</p>
        </li>
      </ol>

      <BookmarkletLink token={token} />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <History className="w-4 h-4" />
          {status.isLoading ? "Comprobando historial…" : history && history.orders > 0
            ? `${history.orders} pedidos analizados (${formatDate(history.firstOrderAt)} – ${formatDate(history.lastOrderAt)})`
            : "Aún sin pedidos: se leerán la primera vez que pulses el marcador en Mercadona."}
        </span>
        {latest?.status === "applied" && latest.result && latest.appliedAt && (
          <span className="inline-flex items-center gap-1.5 text-[#00823F]">
            <CheckCircle2 className="w-4 h-4" />
            Último carro: {latest.result.added.length + latest.result.kept.length} productos el {dateTimeFormat.format(new Date(latest.appliedAt))}
            {latest.result.cartTotal ? ` (≈ ${latest.result.cartTotal} €)` : ""}
          </span>
        )}
      </div>
      {status.isError && !(status.error instanceof ConnectorAuthError) && (
        <p role="alert" className="text-sm text-destructive">{status.error.message}</p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => planMutation.mutate({ menuId: latestMenu?.id })}
          disabled={planMutation.isPending}
          className="rounded-xl bg-[#00823F] border-[#00823F] text-white"
        >
          <Sparkles className="w-4 h-4" />
          {planMutation.isPending ? "Calculando…" : "Calcular cesta de esta semana"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground"
          disabled={action.isPending}
          onClick={() => {
            if (confirm("¿Borrar el historial de pedidos de Mercadona guardado en Mi Cocina? Se volverá a leer la próxima vez que uses el marcador.")) {
              action.mutate("delete-history");
            }
          }}
        >
          <Trash2 className="w-4 h-4" /> Borrar historial
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-xl text-muted-foreground"
          disabled={action.isPending}
          onClick={async () => {
            if (!confirm("¿Desconectar Mercadona? Los marcadores creados dejarán de funcionar.")) return;
            await action.mutateAsync("disconnect").catch(() => undefined);
            storeConnectorToken(userId, null);
            onDisconnect();
          }}
        >
          <Link2Off className="w-4 h-4" /> Desconectar
        </Button>
      </div>
      {planMutation.isError && <p role="alert" className="text-sm text-destructive">{planMutation.error.message}</p>}
      {action.isError && <p role="alert" className="text-sm text-destructive">{action.error.message}</p>}

      {plan && <PlanDetails plan={plan} />}
    </div>
  );
}

function PlanDetails({ plan }: { plan: CartPlan }) {
  const groups = new Map<string, CartPlan["items"]>();
  for (const item of plan.items) {
    const category = item.source === "busqueda" ? "Se buscará en Mercadona" : (item.category?.split(" > ")[0] ?? "Otros");
    groups.set(category, [...(groups.get(category) ?? []), item]);
  }
  const units = plan.items.reduce((total, item) => total + item.quantity, 0);

  return (
    <div className="rounded-2xl bg-card border border-border/60 overflow-hidden">
      <div className="px-5 py-3 border-b border-border/40 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold text-foreground">{plan.items.length} productos · {units} unidades</span>
        <span className="text-muted-foreground">
          para {plan.menuLabel ?? "tu menú"} · {plan.stats.weeksPaired} semanas de menú comparadas con {plan.stats.ordersAnalyzed} pedidos
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {plan.status === "applied" ? "Ya está en tu carro" : "Pulsa el marcador en Mercadona para añadirla"}
        </span>
      </div>
      <div className="divide-y divide-border/30">
        {[...groups.entries()].map(([category, items]) => (
          <div key={category} className="px-5 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{category}</p>
            <ul className="space-y-2">
              {items.map(item => (
                <li key={`${item.key}-${item.productId ?? item.searchQuery}`} className="flex items-start gap-3">
                  {item.thumbnail
                    ? <img src={item.thumbnail} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                    : <div className="w-10 h-10 rounded-lg bg-muted shrink-0" />}
                  <span className="w-8 text-right font-bold text-foreground shrink-0">{item.quantity}×</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">{item.productName ?? item.searchQuery}</span>
                      <span className={cn("text-[10px] font-semibold uppercase rounded-md px-1.5 py-0.5", confidenceStyles[item.confidence])}>
                        {item.confidence}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
