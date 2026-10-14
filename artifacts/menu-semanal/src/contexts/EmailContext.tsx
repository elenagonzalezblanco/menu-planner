import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useUser } from "./UserContext";
import { useToast } from "@/hooks/use-toast";
import {
  deliveriesSchema, deliverySchema, readPendingEmails, removePendingEmail,
  sameEmailRequest, savePendingEmail,
  type EmailDelivery, type EmailRequest, type PendingEmail,
} from "@/lib/email-outbox";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const EmailContext = createContext<{
  send: (request: EmailRequest) => void;
  retry: (id: string, local: boolean) => void;
  pending: PendingEmail[];
  deliveries: EmailDelivery[];
  error: string | null;
  busy: boolean;
} | null>(null);

export function useEmail() {
  const context = useContext(EmailContext);
  if (!context) throw new Error("EmailProvider not mounted");
  return context;
}

export function EmailProvider({ children }: { children: ReactNode }) {
  const { currentUser } = useUser();
  return (
    <UserEmailProvider key={currentUser?.id ?? "anonymous"} userId={currentUser?.id} recipient={currentUser?.email}>
      {children}
    </UserEmailProvider>
  );
}

function UserEmailProvider({ children, userId, recipient }: {
  children: ReactNode; userId?: number; recipient?: string | null;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingEmail[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const processing = useRef(false);
  const mounted = useRef(true);
  const lastSubmission = useRef<{ request: EmailRequest; time: number } | null>(null);
  const queryKey = ["email-deliveries", userId];

  const request = useCallback(async (path: string, method = "GET", body?: unknown, key?: string) => {
    const response = await fetch(`${API_URL}/api/email/${path}`, {
      method,
      headers: {
        "X-User-Id": String(userId),
        "Content-Type": "application/json",
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
        ? data.error : `El servidor no pudo aceptar el correo (${response.status}).`;
      throw new EmailRequestError(message, response.status);
    }
    return data;
  }, [userId]);

  const deliveries = useQuery({
    queryKey,
    queryFn: async () => deliveriesSchema.parse(await request("deliveries")),
    enabled: !!userId,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const flush = useCallback(async () => {
    if (!userId || processing.current) return;
    processing.current = true;
    if (mounted.current) setBusy(true);
    try {
      const saved = readPendingEmails(localStorage, userId);
      if (mounted.current) setPending(saved);
      for (const email of saved) {
        if (!mounted.current || email.blocked) continue;
        try {
          deliverySchema.parse(await request(email.request.kind, "POST", email.request.payload, email.id));
          removePendingEmail(localStorage, userId, email.id);
          await queryClient.invalidateQueries({ queryKey: ["email-deliveries", userId] });
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "No se pudo contactar con el servidor.";
          const blocked = cause instanceof EmailRequestError && cause.status >= 400 && cause.status < 500 && cause.status !== 429 && cause.status !== 408;
          savePendingEmail(localStorage, userId, { ...email, error: message, blocked });
          console.error("Email submission pending", email.id, message);
        }
      }
      if (mounted.current) {
        setPending(readPendingEmails(localStorage, userId));
      }
    } catch (cause) {
      console.error("Email outbox storage error", cause);
      if (mounted.current) setError("No se ha podido leer o guardar la copia pendiente en este navegador. No borres sus datos; el envío no está confirmado.");
    } finally {
      processing.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [userId, request, queryClient]);

  useEffect(() => {
    mounted.current = true;
    void flush();
    const interval = setInterval(() => void flush(), 15000);
    const refresh = () => void flush();
    window.addEventListener("online", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted.current = false;
      clearInterval(interval);
      window.removeEventListener("online", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [flush]);

  const send = (emailRequest: EmailRequest) => {
    if (!userId || !recipient) {
      setError("Configura tu dirección de email en el perfil antes de enviar.");
      return;
    }
    try {
      const saved = readPendingEmails(localStorage, userId);
      const recent = lastSubmission.current;
      if (saved.some(email => sameEmailRequest(email.request, emailRequest)) ||
        (recent && Date.now() - recent.time < 5000 && sameEmailRequest(recent.request, emailRequest))) {
        toast({ title: "Este correo ya está pendiente", description: "Puedes consultar su estado debajo." });
        return;
      }
      const email: PendingEmail = { id: crypto.randomUUID(), request: emailRequest, createdAt: new Date().toISOString() };
      savePendingEmail(localStorage, userId, email);
      lastSubmission.current = { request: structuredClone(emailRequest), time: Date.now() };
      setPending(readPendingEmails(localStorage, userId));
      setError(null);
      toast({ title: "Solicitud de email guardada", description: `Destino: ${recipient}. Consulta el estado del envío.` });
      void flush();
    } catch (cause) {
      console.error("Cannot persist email request", cause);
      setError("No se pudo guardar la solicitud de email. El envío no se ha iniciado. Comprueba el almacenamiento del navegador y vuelve a intentarlo.");
    }
  };

  const retry = async (id: string, local: boolean) => {
    if (!userId || processing.current) return;
    setError(null);
    try {
      if (local) {
        const email = readPendingEmails(localStorage, userId).find(item => item.id === id);
        if (!email) throw new Error("La solicitud pendiente ya no está disponible. Actualiza la página.");
        savePendingEmail(localStorage, userId, { ...email, blocked: false, error: undefined });
        await flush();
      } else {
        processing.current = true;
        setBusy(true);
        deliverySchema.parse(await request(`deliveries/${id}/retry`, "POST"));
        await queryClient.invalidateQueries({ queryKey });
      }
    } catch (cause) {
      console.error("Email retry failed", cause);
      setError(cause instanceof Error ? cause.message : "No se pudo reintentar el envío.");
    } finally {
      if (!local) processing.current = false;
      setBusy(false);
    }
  };

  return (
    <EmailContext.Provider value={{
      send, retry: (id, local) => { void retry(id, local); }, pending,
      deliveries: deliveries.data ?? [],
      error: error ?? (deliveries.error ? "No se puede consultar el estado del correo. No se considera enviado hasta recibir confirmación del servidor." : null),
      busy,
    }}>
      {children}
    </EmailContext.Provider>
  );
}

class EmailRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
