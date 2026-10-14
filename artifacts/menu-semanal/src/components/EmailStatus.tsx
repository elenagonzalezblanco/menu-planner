import { useEmail } from "@/contexts/EmailContext";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";

const labels = {
  queued: "Guardado en el servidor; pendiente de envío",
  sending: "Enviando",
  succeeded: "Envío aceptado por el proveedor",
  failed: "No se ha podido enviar",
};

export function EmailStatus() {
  const { pending, deliveries, error, retry, busy } = useEmail();
  if (!pending.length && !deliveries.length && !error) return null;
  const visible = deliveries.filter(item => item.status !== "succeeded").concat(
    deliveries.filter(item => item.status === "succeeded").slice(0, 1),
  );
  return (
    <section aria-label="Estado de los correos" className="mb-6 rounded-2xl border bg-card p-4 space-y-3">
      <h2 className="font-semibold flex items-center gap-2"><Mail className="w-4 h-4" /> Envíos por email</h2>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div aria-live="polite" className="space-y-3 text-sm">
        {pending.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p>{item.request.kind === "menu" ? "Menú" : "Lista de la compra"}: {item.blocked ? "El servidor no ha aceptado la solicitud" : "Pendiente de conexión con el servidor"}</p>
              <p className="text-muted-foreground">Copia guardada en este navegador. {item.blocked ? "Corrige el error y reintenta." : "Se reintentará mientras la aplicación esté abierta."}</p>
              {item.error && <p className="text-destructive">{item.error}</p>}
            </div>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => retry(item.id, true)}>Reintentar solicitud</Button>
          </div>
        ))}
        {visible.map(item => (
          <div key={item.id} className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p>{labels[item.status]} — {item.recipient}</p>
              {item.error && <p className="text-destructive">{item.error}</p>}
              <p className="text-xs text-muted-foreground">Referencia: {item.id}</p>
            </div>
            {item.status === "failed" && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => retry(item.id, false)}>Reintentar envío</Button>}
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">La aceptación del proveedor no garantiza la llegada a la bandeja de entrada. Comprueba también Spam. Los correos guardados en el servidor no se pierden al cerrar la página; los reintentos continúan cuando el servidor está activo.</p>
    </section>
  );
}
