import { Router, type IRouter } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { AuthenticatedRequest } from "../middlewares/auth";
import { createLinkCode, listWhatsAppIngredients } from "../lib/whatsapp-store";
import { whatsappConfig } from "../lib/whatsapp";
import { whatsappReady } from "../lib/whatsapp-service";

const router: IRouter = Router();
const attempts = new Map<number, { count: number; expires: number }>();

router.use("/whatsapp", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!whatsappReady()) return res.status(503).json({ error: "WhatsApp se está inicializando. Inténtalo de nuevo." });
  return next();
});

router.get("/whatsapp/status", async (req: AuthenticatedRequest, res) => {
  const { rows: [link] } = await pool.query<{ phone: string | null }>(
    "SELECT phone FROM whatsapp_links WHERE user_id = $1", [req.user!.id],
  );
  const config = whatsappConfig();
  res.json({
    configured: !!config,
    phone: link?.phone ? `***${link.phone.slice(-4)}` : null,
    chatUrl: config ? `https://wa.me/${config.businessNumber}` : null,
  });
});

// The app's user-id header is identification, not proof of account ownership.
// Re-authenticate before granting a phone durable write access to an account.
router.use(["/whatsapp/link", "/whatsapp/unlink"], async (req: AuthenticatedRequest, res, next) => {
  if (req.method !== "POST") return res.sendStatus(405);
  const userId = req.user!.id;
  const now = Date.now();
  for (const [id, entry] of attempts) if (entry.expires < now) attempts.delete(id);
  const entry = attempts.get(userId) ?? { count: 0, expires: now + 60_000 };
  attempts.set(userId, entry);
  if (++entry.count > 5) return res.status(429).json({ error: "Demasiados intentos. Espera un minuto." });
  const password: unknown = req.body?.password;
  if (typeof password !== "string" || password.length > 1024) {
    return res.status(400).json({ error: "Introduce tu contraseña para vincular o desvincular WhatsApp." });
  }
  const { rows: [user] } = await pool.query<{ password_hash: string | null }>(
    "SELECT password_hash FROM users WHERE id = $1", [userId],
  );
  const hash = createHash("sha256").update("menu-planner-salt-2026" + password).digest("hex");
  if (!user?.password_hash || user.password_hash.length !== hash.length
    || !timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash))) {
    return res.status(401).json({ error: "Contraseña incorrecta." });
  }
  return next();
});

router.post("/whatsapp/link", async (req: AuthenticatedRequest, res) => {
  const config = whatsappConfig();
  if (!config) return res.status(503).json({ error: "Falta configurar la API de WhatsApp en el servidor." });
  const code = await createLinkCode(req.user!.id);
  return res.json({
    code,
    expiresInSeconds: 600,
    url: `https://wa.me/${config.businessNumber}?text=${encodeURIComponent(`vincular ${code}`)}`,
  });
});

router.post("/whatsapp/unlink", async (req: AuthenticatedRequest, res) => {
  await pool.query("DELETE FROM whatsapp_links WHERE user_id = $1", [req.user!.id]);
  res.json({ success: true });
});

router.get("/whatsapp/ingredients", async (req: AuthenticatedRequest, res) => {
  res.json(await listWhatsAppIngredients(req.user!.id));
});

router.delete("/whatsapp/ingredients/:id", async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: "Ingrediente inválido." });
  const { rowCount } = await pool.query(
    "DELETE FROM whatsapp_ingredients WHERE id = $1 AND user_id = $2", [id, req.user!.id],
  );
  if (!rowCount) return res.status(404).json({ error: "Ingrediente no encontrado." });
  return res.sendStatus(204);
});

router.use((error: unknown, req: AuthenticatedRequest, res: import("express").Response, _next: import("express").NextFunction) => {
  req.log?.error({ errorType: error instanceof Error ? error.name : "unknown" }, "WhatsApp account operation failed");
  res.status(500).json({ error: "No se pudo completar la operación de WhatsApp. Inténtalo de nuevo." });
});

export default router;
