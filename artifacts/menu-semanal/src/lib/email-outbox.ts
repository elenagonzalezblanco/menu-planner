import { z } from "zod";

const menuRequest = z.object({
  kind: z.literal("menu"),
  payload: z.object({ days: z.array(z.unknown()).min(1), subject: z.string().optional() }),
});
const shoppingRequest = z.object({
  kind: z.literal("shopping"),
  payload: z.object({
    items: z.array(z.object({ ingredient: z.string(), recipes: z.array(z.string()) })),
    extraItems: z.array(z.string()).optional(),
  }),
});
const requestSchema = z.discriminatedUnion("kind", [menuRequest, shoppingRequest]);
const pendingSchema = z.object({
  id: z.string().uuid(),
  request: requestSchema,
  createdAt: z.string(),
  error: z.string().optional(),
  blocked: z.boolean().optional(),
});

export const deliverySchema = z.object({
  id: z.string(),
  status: z.enum(["queued", "sending", "succeeded", "failed"]),
  recipient: z.string(),
  error: z.string().nullish(),
});
export const deliveriesSchema = z.array(deliverySchema);
export type EmailRequest = z.infer<typeof requestSchema>;
export type PendingEmail = z.infer<typeof pendingSchema>;
export type EmailDelivery = z.infer<typeof deliverySchema>;

const prefix = (userId: number) => `email-outbox:${userId}:`;

export function readPendingEmails(storage: Storage, userId: number): PendingEmail[] {
  const result: PendingEmail[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix(userId))) continue;
    const raw = storage.getItem(key);
    if (raw === null) continue;
    const parsed = pendingSchema.parse(JSON.parse(raw));
    if (key !== prefix(userId) + parsed.id) throw new Error("Invalid email outbox key");
    result.push(parsed);
  }
  return result.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function savePendingEmail(storage: Storage, userId: number, email: PendingEmail) {
  const validated = pendingSchema.parse(email);
  storage.setItem(prefix(userId) + validated.id, JSON.stringify(validated));
}

export function removePendingEmail(storage: Storage, userId: number, id: string) {
  storage.removeItem(prefix(userId) + id);
}

export function sameEmailRequest(a: EmailRequest, b: EmailRequest): boolean {
  return JSON.stringify(requestSchema.parse(a)) === JSON.stringify(requestSchema.parse(b));
}
