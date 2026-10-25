import { createHmac, timingSafeEqual } from "node:crypto";

export const WHATSAPP_HELP = 'Envía "añade leche, huevos y pan", "lista: 2 litros de leche, pan" o una foto de tu lista escrita a mano para añadir productos a tu lista de la compra. Para vincular tu cuenta, usa el código de la sección WhatsApp de la web. No se admiten audios; no se modifica el carrito de Mercadona.';

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
  /** Text body, or the caption of a photo. */
  text: string;
  /** WhatsApp media id of a photo (a handwritten shopping list). */
  mediaId?: string;
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
        const image = message.type === "image" ? record(message.image) : undefined;
        const text = message.type === "text" ? record(message.text)?.body : image?.caption;
        const mediaId = typeof image?.id === "string" && /^\d{1,40}$/.test(image.id) ? image.id : undefined;
        messages.push({
          id: message.id,
          phone: message.from,
          text: typeof text === "string" && text.length <= 2000 ? text : "",
          ...(mediaId ? { mediaId } : {}),
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

/** WhatsApp photos are at most 5 MB; anything larger is not a phone photo of a list. */
export const MAX_MEDIA_BYTES = 8 * 1024 * 1024;

/** Meta hosts media on its own CDN; never send the access token anywhere else. */
function isMetaMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)(fbsbx\.com|fbcdn\.net|facebook\.com|whatsapp\.net)$/.test(url.hostname);
  } catch {
    return false;
  }
}

export async function downloadWhatsAppMedia(config: WhatsAppConfig, mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
  // Meta's media CDN rejects clients without a browser-like User-Agent.
  const headers = { Authorization: `Bearer ${config.accessToken}`, "User-Agent": "Mozilla/5.0 (compatible; MiCocina/1.0)" };
  const meta = await fetch(`https://graph.facebook.com/${config.graphVersion}/${encodeURIComponent(mediaId)}`, {
    headers, signal: AbortSignal.timeout(15_000),
  });
  if (!meta.ok) throw new Error(`WhatsApp media HTTP ${meta.status}`);
  const info = await meta.json() as { url?: unknown; mime_type?: unknown; file_size?: unknown };
  if (!isMetaMediaUrl(info.url)) throw new Error("WhatsApp media URL is not hosted by Meta");
  if (typeof info.file_size === "number" && info.file_size > MAX_MEDIA_BYTES) throw new Error("WhatsApp media too large");
  const file = await fetch(info.url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!file.ok) throw new Error(`WhatsApp media download HTTP ${file.status}`);
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length === 0 || data.length > MAX_MEDIA_BYTES) throw new Error("WhatsApp media size not supported");
  const mimeType = typeof info.mime_type === "string" ? info.mime_type : file.headers.get("content-type") ?? "image/jpeg";
  return { data, mimeType: mimeType.split(";")[0].trim().toLowerCase() };
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
