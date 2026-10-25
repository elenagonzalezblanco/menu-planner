import { Link } from "wouter";
import { CheckCircle2, Clock, Loader2, ShoppingCart, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCartRequest } from "@/hooks/use-mercadona-cart";

type CartRequest = ReturnType<typeof useCartRequest>;

/** «Rellena la cesta automática»: queues the fill; Scout's Mercadona tab does it. */
export function AutoCartButton({ cart }: { cart: CartRequest }) {
  const status = cart.data?.request?.status;
  const busy = cart.start.isPending || status === "pending" || status === "running";
  return (
    <Button
      type="button"
      onClick={() => cart.start.mutate()}
      disabled={busy}
      className="rounded-xl px-6 bg-[#00823F] hover:bg-[#006B34] text-white shadow-lg shadow-[#00823F]/30"
      size="lg"
    >
      {busy ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <ShoppingCart className="w-5 h-5 mr-2" />}
      {busy ? "Rellenando la cesta…" : "Rellena la cesta automática"}
    </Button>
  );
}

const timeFormat = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });

export function AutoCartStatus({ cart }: { cart: CartRequest }) {
  const request = cart.data?.request;
  if (cart.start.isError) {
    return <p role="alert" className="text-destructive text-sm">{cart.start.error.message}</p>;
  }
  if (!request) return null;
  // Old results only add noise: show progress, and outcomes from the last hour.
  const finishedAgo = request.finishedAt ? Date.now() - Date.parse(request.finishedAt) : 0;
  if (finishedAgo > 60 * 60 * 1000) return null;

  const box = "rounded-2xl border p-4 text-sm flex gap-3 items-start";
  if (request.status === "pending" || request.status === "running") {
    return (
      <div role="status" className={`${box} border-[#00823F]/30 bg-[#00823F]/5`}>
        <Loader2 className="w-5 h-5 text-[#00823F] animate-spin shrink-0 mt-0.5" />
        <div>
          <p className="font-medium text-foreground">
            {request.status === "running" ? "Metiendo en tu carro de Mercadona todos los ingredientes del menú…" : "Preparando tu cesta…"}
          </p>
          {request.status === "pending" && !cart.data?.watcherOnline && (
            <p className="text-muted-foreground mt-1">
              Ahora mismo Scout no está conectado en tu ordenador. Se rellenará en cuanto se conecte (durante los próximos 15 minutos).
              También puedes hacerlo con el marcador de la página <Link href="/mercadona" className="underline">Mercadona</Link>.
            </p>
          )}
        </div>
      </div>
    );
  }
  if (request.status === "done") {
    return (
      <div role="status" className={`${box} border-[#00823F]/30 bg-[#00823F]/5`}>
        <CheckCircle2 className="w-5 h-5 text-[#00823F] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Cesta rellenada{request.finishedAt ? ` a las ${timeFormat.format(new Date(request.finishedAt))}` : ""}
            {request.summary ? `: ${request.summary.products} productos${request.summary.total ? ` (≈ ${request.summary.total} €)` : ""}` : ""}.
          </p>
          <p className="text-muted-foreground">
            Revísala en <a href="https://tienda.mercadona.es" target="_blank" rel="noreferrer" className="underline">Mercadona</a> y pulsa
            «Añadir al pedido en curso» o «Tramitar nuevo pedido». No se ha comprado nada.
          </p>
          {request.message && <p className="text-muted-foreground">Revisa: {request.message}</p>}
        </div>
      </div>
    );
  }
  const Icon = request.status === "expired" ? Clock : XCircle;
  return (
    <div role="alert" className={`${box} border-destructive/30 bg-destructive/5`}>
      <Icon className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <div>
        <p className="font-medium text-foreground">No se pudo rellenar la cesta.</p>
        {request.message && <p className="text-muted-foreground mt-1">{request.message}</p>}
      </div>
    </div>
  );
}
