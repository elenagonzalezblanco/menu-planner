import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUser } from "@/contexts/UserContext";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export function whatsappRequest(userId: number, path: string, method: "DELETE"): Promise<void>;
export function whatsappRequest<T>(userId: number, path: string, method?: "GET" | "POST", body?: unknown): Promise<T>;
export async function whatsappRequest(userId: number, path: string, method = "GET", body?: unknown): Promise<unknown> {
  const response = await fetch(`${API_URL}/api/whatsapp/${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-User-Id": String(userId) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "No se pudo conectar con WhatsApp." }));
    throw new Error(error.error ?? "No se pudo completar la operación.");
  }
  return response.status === 204 ? undefined : response.json();
}

export function useWhatsAppIngredients() {
  const { currentUser } = useUser();
  const userId = currentUser?.id;
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["whatsapp-ingredients", userId],
    enabled: !!userId,
    queryFn: () => whatsappRequest<{ id: number; ingredient: string }[]>(userId!, "ingredients"),
    refetchInterval: 10_000,
  });
  const remove = useMutation({
    mutationFn: (id: number) => whatsappRequest(userId!, `ingredients/${id}`, "DELETE"),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["whatsapp-ingredients", userId] });
      await client.invalidateQueries({ predicate: query => String(query.queryKey[0]).startsWith("/api/shopping-list") });
    },
  });
  return { ...query, remove };
}
