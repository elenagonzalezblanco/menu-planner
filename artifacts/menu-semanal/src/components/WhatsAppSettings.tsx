import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";
import { whatsappRequest } from "@/hooks/use-whatsapp";
import { Button } from "@/components/ui/button";

interface Status { configured: boolean; phone: string | null; chatUrl: string | null }
interface Link { code: string; url: string; expiresInSeconds: number }

export function WhatsAppSettings() {
  const { currentUser } = useUser();
  return currentUser ? <AccountWhatsAppSettings key={currentUser.id} userId={currentUser.id} /> : null;
}

function AccountWhatsAppSettings({ userId }: { userId: number }) {
  const [password, setPassword] = useState("");
  const [link, setLink] = useState<Link | null>(null);
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ["whatsapp-status", userId],
    queryFn: () => whatsappRequest<Status>(userId, "status"),
    refetchInterval: 10_000,
  });
  const mutation = useMutation({
    mutationFn: async (action: "link" | "unlink") => {
      if (action === "link") return whatsappRequest<Link>(userId, "link", "POST", { password });
      await whatsappRequest(userId, "unlink", "POST", { password });
      return null;
    },
    onSuccess: async result => {
      setPassword("");
      setLink(result);
      await client.invalidateQueries({ queryKey: ["whatsapp-status", userId] });
    },
  });

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-3" aria-label="WhatsApp">
      <h2 className="text-lg font-semibold">Añadir desde WhatsApp</h2>
      <p className="text-sm text-muted-foreground">
        Envía «añade leche, huevos y pan» o una foto de tu lista escrita a mano y aparecerán aquí junto a los
        ingredientes del menú. También funciona sin menú. No modifica el carrito de Mercadona.
      </p>
      {status.isLoading && <p role="status">Comprobando conexión…</p>}
      {status.isError && <p role="alert" className="text-destructive">{status.error.message}</p>}
      {status.data && !status.data.configured && (
        <p className="text-sm text-muted-foreground">Pendiente de activación: configura el número y las credenciales de WhatsApp Business en el servidor.</p>
      )}
      {status.data?.configured && (
        <>
          <p className="text-sm">{status.data.phone ? `Teléfono vinculado: ${status.data.phone}` : "Vincula tu teléfono con un código de un solo uso."}</p>
          <form className="flex flex-wrap gap-2" onSubmit={event => {
            event.preventDefault();
            mutation.mutate(status.data?.phone ? "unlink" : "link");
          }}>
            <label className="sr-only" htmlFor="whatsapp-password">Contraseña de tu cuenta</label>
            <input id="whatsapp-password" type="password" autoComplete="current-password"
              value={password} onChange={event => setPassword(event.target.value)}
              placeholder="Contraseña de tu cuenta" maxLength={1024}
              className="rounded-xl border bg-background px-3 py-2 text-sm" required />
            <Button type="submit" variant="outline" disabled={!password || mutation.isPending}>
              {mutation.isPending ? "Procesando…" : status.data.phone ? "Desvincular WhatsApp" : "Generar código"}
            </Button>
          </form>
          {status.data.phone && status.data.chatUrl && (
            <a className="text-primary underline" href={status.data.chatUrl} target="_blank" rel="noreferrer">Abrir conversación en WhatsApp</a>
          )}
          {link && !status.data.phone && (
            <div className="space-y-2 text-sm" role="status">
              <p>Abre WhatsApp y envía el mensaje preparado. El código caduca en 10 minutos; no lo compartas.</p>
              <a className="text-primary underline" href={link.url} target="_blank" rel="noreferrer">Vincular mi WhatsApp</a>
              <p className="break-all">También puedes enviar: <code>vincular {link.code}</code></p>
            </div>
          )}
        </>
      )}
      {mutation.isError && <p role="alert" className="text-destructive text-sm">{mutation.error.message}</p>}
    </section>
  );
}
