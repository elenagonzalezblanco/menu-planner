import { getAzureOpenAIClient, MODEL } from "./azure-openai";
import { normalizeIngredient } from "./whatsapp";

/** Formats the vision model reads; WhatsApp photos are JPEG or PNG. */
export const READABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
export const MAX_IMAGE_ITEMS = 40;

const SYSTEM_PROMPT = `Lees fotos de listas de la compra, normalmente escritas a mano y en español.
Devuelve solo JSON con la forma {"items": ["..."]}: un elemento por producto, tal y como está escrito,
conservando cantidades y marcas ("2 leches", "1 kg tomates", "yogures Danone").
Ignora títulos, fechas, precios, lo que esté tachado o marcado como comprado y todo lo que no sea un producto.
Corrige solo errores evidentes de lectura, sin inventar productos.
Si la foto no es una lista de la compra o no se puede leer, devuelve {"items": []}.`;

/** Cleans what the model returns: one short line per product, no bullets, no duplicates. */
export function parseImageItems(content: string | null | undefined): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content ?? "");
  } catch {
    return [];
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  if (!Array.isArray(items)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    if (typeof item !== "string") continue;
    const cleaned = item
      .replace(/^[\s\-–—•*·☐☑✓✔□■▪>]+/u, "")
      .replace(/^\d+[.)]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    const key = normalizeIngredient(cleaned);
    if (!cleaned || cleaned.length > 120 || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length === MAX_IMAGE_ITEMS) break;
  }
  return result;
}

export class UnreadableImageError extends Error {}

export async function readShoppingListImage(image: { data: Buffer; mimeType: string }): Promise<string[]> {
  if (!READABLE_IMAGE_TYPES.has(image.mimeType)) throw new UnreadableImageError(`Unsupported image type ${image.mimeType}`);
  const client = await getAzureOpenAIClient();
  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          { type: "text", text: "Esta es mi lista de la compra:" },
          { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data.toString("base64")}`, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_completion_tokens: 1200,
  }, { timeout: 60_000 });
  return parseImageItems(completion.choices[0]?.message?.content);
}
