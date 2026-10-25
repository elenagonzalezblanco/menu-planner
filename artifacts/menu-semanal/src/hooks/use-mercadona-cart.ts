import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
/** Absolute origin of the API: the bookmarklet runs on tienda.mercadona.es, so relative URLs would not work. */
export const API_ORIGIN = (API_URL || window.location.origin).replace(/\/+$/, "");

export type PlanConfidence = "alta" | "media" | "baja";

export interface CartPlanItem {
  key: string;
  ingredients: string[];
  recipes: string[];
  productId: string | null;
  productName: string | null;
  searchQuery: string | null;
  quantity: number;
  category: string | null;
  unitPrice: string | null;
  thumbnail: string | null;
  source: "historial" | "busqueda";
  confidence: PlanConfidence;
  reason: string;
}

export interface SkippedIngredient {
  key: string;
  ingredients: string[];
  recipes: string[];
  productId: string | null;
  productName: string | null;
  quantity: number;
  reason: string;
}

export interface CartPlan {
  id: number;
  menuId: number | null;
  menuLabel: string | null;
  items: CartPlanItem[];
  skipped: SkippedIngredient[];
  status: "pending" | "applied";
  result: {
    added: { productId: string; productName: string; quantity: number }[];
    kept: { productId: string; productName: string; quantity: number }[];
    missing: { ingredients: string[]; reason: string }[];
    cartTotal: string | null;
  } | null;
  stats: { ordersAnalyzed: number; weeksPaired: number; firstOrderAt: string | null; lastOrderAt: string | null };
  createdAt: string;
  appliedAt: string | null;
}

export interface ConnectorStatus {
  connected: boolean;
  connectedAt: string | null;
  lastUsedAt: string | null;
  history: { orders: number; firstOrderAt: string | null; lastOrderAt: string | null; lastSyncAt: string | null };
  latestPlan: CartPlan | null;
}

export class ConnectorAuthError extends Error {}

const tokenKey = (userId: number) => `mercadona-connector-${userId}`;

export function readConnectorToken(userId: number): string | null {
  try {
    return localStorage.getItem(tokenKey(userId));
  } catch {
    return null;
  }
}

export function storeConnectorToken(userId: number, token: string | null) {
  try {
    if (token) localStorage.setItem(tokenKey(userId), token);
    else localStorage.removeItem(tokenKey(userId));
  } catch { /* private mode: the bookmark still works */ }
}

async function connectorRequest<T>(token: string, path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}/api/mercadona-connector${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new ConnectorAuthError(data.error ?? "Vuelve a conectar Mercadona.");
  if (!response.ok) throw new Error(data.error ?? "No se pudo conectar con el servidor.");
  return data as T;
}

export async function createConnectorToken(userId: number, password: string): Promise<string> {
  const response = await fetch(`${API_URL}/api/mercadona/connector`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": String(userId) },
    body: JSON.stringify({ password }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || typeof data.token !== "string") throw new Error(data.error ?? "No se pudo conectar Mercadona.");
  return data.token;
}

/** `javascript:` bookmark that loads the connector on tienda.mercadona.es with this device's token. */
export function bookmarkletFor(token: string): string {
  const code = `(()=>{const s=document.createElement('script');s.src=${JSON.stringify(`${API_ORIGIN}/mercadona-connector.js`)}+'?t='+Date.now();` +
    `s.dataset.api=${JSON.stringify(API_ORIGIN)};s.dataset.token=${JSON.stringify(token)};document.body.appendChild(s);})()`;
  return `javascript:${encodeURIComponent(code)}`;
}

export function useConnectorStatus(token: string | null) {
  return useQuery({
    queryKey: ["mercadona-connector-status", token],
    enabled: !!token,
    queryFn: () => connectorRequest<ConnectorStatus>(token!, "/status"),
    refetchInterval: 15_000,
    retry: (count, error) => !(error instanceof ConnectorAuthError) && count < 2,
  });
}

export function useCartPlan(token: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { menuId?: number; extraIngredients: string[] }) =>
      connectorRequest<CartPlan>(token!, "/plan", "POST", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mercadona-connector-status", token] }),
  });
}

export function useConnectorAction(token: string | null) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: "disconnect" | "delete-history") => action === "disconnect"
      ? connectorRequest(token!, "/disconnect", "POST")
      : connectorRequest(token!, "/history", "DELETE"),
    onSuccess: () => client.invalidateQueries({ queryKey: ["mercadona-connector-status", token] }),
  });
}
