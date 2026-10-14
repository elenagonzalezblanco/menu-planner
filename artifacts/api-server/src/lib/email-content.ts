import type { EmailMessage } from "@azure/communication-email";

export const SENDER_ADDRESS = "DoNotReply@a386371c-ce60-494f-b8ab-bd686c6f096e.azurecomm.net";
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class EmailValidationError extends Error {}
const slots = ["primero", "primero2", "segundo", "segundo2"] as const;
type Meal = Partial<Record<typeof slots[number], { name: string } | null>>;
export interface MenuDay { day: string; lunch: Meal | null; dinner: Meal | null }
export interface MenuPayload { days: MenuDay[]; subject?: string }
export interface ShoppingPayload { items: { ingredient: string; recipes: string[] }[]; extraItems?: string[] }

function object(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new EmailValidationError("Formato de email no válido");
}
function text(value: unknown, max = 500): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new EmailValidationError("Texto de email no válido");
}
function array(value: unknown, max: number): asserts value is unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new EmailValidationError("Lista de email no válida");
}
export function validateMenu(value: unknown): asserts value is MenuPayload {
  object(value);
  array(value.days, 14);
  if (!value.days.length) throw new EmailValidationError("El menú está vacío");
  if (value.subject !== undefined) {
    text(value.subject, 200);
    if (/[\r\n]/.test(value.subject)) throw new EmailValidationError("Asunto no válido");
  }
  for (const day of value.days) {
    object(day);
    text(day.day, 80);
    for (const mealKey of ["lunch", "dinner"]) {
      const meal = day[mealKey];
      if (meal === null) continue;
      object(meal);
      for (const slot of slots) {
        const recipe = meal[slot];
        if (recipe === undefined || recipe === null) continue;
        object(recipe);
        text(recipe.name, 500);
      }
    }
  }
}
export function validateShopping(value: unknown): asserts value is ShoppingPayload {
  object(value);
  array(value.items, 500);
  for (const item of value.items) {
    object(item);
    text(item.ingredient);
    array(item.recipes, 100);
    item.recipes.forEach(recipe => text(recipe));
  }
  if (value.extraItems !== undefined) {
    array(value.extraItems, 500);
    value.extraItems.forEach(extra => text(extra));
  }
}
export function validateRecipient(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(value)) {
    throw new EmailValidationError("Configura una dirección de email válida en tu perfil");
  }
}
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}
function message(recipient: string, subject: string, html: string): EmailMessage {
  return {
    senderAddress: SENDER_ADDRESS,
    recipients: { to: [{ address: recipient }] },
    content: { subject, html: `<div style="font-family:sans-serif;max-width:800px;margin:auto">${html}<p>La Cocina — Menu Planner</p></div>` },
  };
}
export function menuMessage(
  payload: MenuPayload,
  recipient: string,
  pdf: (title: string, days: MenuDay[], date: Date) => Buffer,
  date = new Date(),
): EmailMessage {
  const cellStyle = "padding:8px;border:1px solid #ddd;text-align:center";
  const header = payload.days.map(day => `<th style="${cellStyle};background:#E8602C;color:white">${escapeHtml(day.day)}</th>`).join("");
  const rows = (["lunch", "dinner"] as const).flatMap(meal => slots.flatMap(slot => {
    if (slot.endsWith("2") && !payload.days.some(day => day[meal]?.[slot])) return [];
    const label = `${meal === "lunch" ? "Comida" : "Cena"} · ${slot.startsWith("primero") ? "Primero" : "Segundo"}${slot.endsWith("2") ? " 2" : ""}`;
    return [`<tr><th style="${cellStyle}">${label}</th>${payload.days.map(day => `<td style="${cellStyle}">${escapeHtml(day[meal]?.[slot]?.name ?? "—")}</td>`).join("")}</tr>`];
  })).join("");
  return {
    ...message(recipient, payload.subject ?? "🍽️ Tu Menú Semanal",
      `<h2>🍽️ Tu Menú Semanal</h2><p>${escapeHtml(date.toLocaleDateString("es-ES"))}</p><table style="border-collapse:collapse;width:100%"><thead><tr><th></th>${header}</tr></thead><tbody>${rows}</tbody></table>`),
    attachments: [{
      name: "menu-semanal.pdf",
      contentType: "application/pdf",
      contentInBase64: pdf("Menu Semanal", payload.days, date).toString("base64"),
    }],
  };
}
export function shoppingMessage(payload: ShoppingPayload, recipient: string): EmailMessage {
  const items = payload.items.map(item => `<li><strong>${escapeHtml(item.ingredient)}</strong> (${item.recipes.map(escapeHtml).join(", ")})</li>`).join("");
  const extras = payload.extraItems?.length
    ? `<h3>Añadidos a mano</h3><ul>${payload.extraItems.map(extra => `<li>${escapeHtml(extra)}</li>`).join("")}</ul>` : "";
  return message(recipient, "🛒 Lista de la Compra", `<h2>🛒 Lista de la Compra</h2><ul>${items}</ul>${extras}`);
}
