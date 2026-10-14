import { createHmac, timingSafeEqual } from "node:crypto";

export const WHATSAPP_HELP = 'Envía "añade leche, huevos y pan" o "lista: 2 litros de leche, pan" para añadir ingredientes a tu lista de la compra. Para vincular tu cuenta, usa el código de la sección WhatsApp de la web. Solo se admiten mensajes de texto; no se modifica el carrito de Mercadona.';

export type ShoppingCommand =
  | { kind: "link"; code: string }
  | { kind: "list"; ingredients: string[] }
  | { kind: "help" };

export function parseShoppingCommand(text: string): ShoppingCommand {
  const input = text.trim();
  if (input.length > 2000) return { kind: "help" };
  const link = /^vincular\s+([a-f0-9]{32})$/i.exec(input);
  if (link) return { kind: "link", code: link[1].toLowerCase() };
  const list = /^(?:añade|añadir|agrega|agregar|apunta)\s+(?:(?:a|en)\s+la\s+lista(?:\s+de\s+la\s+compra)?\s*:?\s*)?(.+)$/is.exec(input)
    ?? /^lista\s*:\s*(.+)$/is.exec(input);
  const content = list?.[1];
  if (!content) return { kind: "help" };
  const ingredients = content
    .replace(/\s+a la lista(?: de la compra)?[.!]?$/i, "")
    .split(/(?<!\d),|,(?!\d)|[;\n]|\s+y\s+/i)
    .map(item => item.trim().replace(/[.!]+$/, "").trim())
    .filter(Boolean);
  if (!ingredients.length || ingredients.length > 20 || ingredients.some(item => item.length > 120)) {
    return { kind: "help" };
  }
  return { kind: "list", ingredients };
}

export const normalizeIngredient = (ingredient: string): string =>
  ingredient.normalize("NFC").trim().toLocaleLowerCase("es").replace(/\s+/g, " ");

export interface ShoppingItem {
  ingredient: string;
  recipes: string[];
  mercadonaProducts: unknown[];
}

export function mergeWhatsAppIngredients<T extends ShoppingItem>(
  items: T[], extras: { ingredient: string }[],
): (T | ShoppingItem)[] {
  const merged = new Map<string, T | ShoppingItem>(
    items.map(item => [normalizeIngredient(item.ingredient), { ...item, recipes: [...item.recipes] }]),
  );
  for (const { ingredient } of extras) {
    const key = normalizeIngredient(ingredient);
    const existing = merged.get(key);
    if (existing) {
      if (!existing.recipes.includes("WhatsApp")) existing.recipes.push("WhatsApp");
    } else {
      merged.set(key, { ingredient, recipes: ["WhatsApp"], mercadonaProducts: [] });
    }
  }
  return [...merged.values()];
}

export function validMetaSignature(body: Buffer, signature: string | undefined, secret: string): boolean {
  if (!secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), "hex"));
}

export interface IncomingWhatsAppMessage {
  id: string;
  phone: string;
  text: string;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export function extractWhatsAppMessages(payload: unknown, phoneNumberId: string): IncomingWhatsAppMessage[] {
  const root = record(payload);
  if (root?.object !== "whatsapp_business_account" || !Array.isArray(root.entry)) return [];
  const messages: IncomingWhatsAppMessage[] = [];
  for (const entry of root.entry) {
    const changes = record(entry)?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const item = record(change);
      const value = record(item?.value);
      if (item?.field !== "messages" || record(value?.metadata)?.phone_number_id !== phoneNumberId) continue;
      if (!Array.isArray(value?.messages)) continue;
      for (const raw of value.messages) {
        const message = record(raw);
        if (typeof message?.id !== "string" || message.id.length > 200
          || typeof message.from !== "string" || !/^\d{7,15}$/.test(message.from)) continue;
        const text = message.type === "text" ? record(message.text)?.body : "";
        messages.push({
          id: message.id,
          phone: message.from,
          text: typeof text === "string" && text.length <= 2000 ? text : "",
        });
      }
    }
  }
  return messages;
}

export interface WhatsAppConfig {
  appSecret: string;
  verifyToken: string;
  accessToken: string;
  phoneNumberId: string;
  businessNumber: string;
  graphVersion: string;
}

export function whatsappConfig(): WhatsAppConfig | undefined {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const businessNumber = process.env.WHATSAPP_BUSINESS_NUMBER;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION;
  if (!appSecret || !verifyToken || !accessToken || !phoneNumberId || !businessNumber || !graphVersion) return;
  if (!/^\d+$/.test(phoneNumberId) || !/^\d{7,15}$/.test(businessNumber) || !/^v\d+\.\d+$/.test(graphVersion)) return;
  return { appSecret, verifyToken, accessToken, phoneNumberId, businessNumber, graphVersion };
}

export async function sendWhatsAppReply(config: WhatsAppConfig, phone: string, text: string): Promise<void> {
  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: phone, type: "text", text: { body: text.slice(0, 4096) } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`WhatsApp delivery HTTP ${response.status}`);
}
