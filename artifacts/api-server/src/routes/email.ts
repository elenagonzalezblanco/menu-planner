import { Router, type IRouter, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middlewares/auth";
import { generateMenuPdf } from "./saved-menus";
import { emailOutboxReady, emailRepository } from "../lib/email-service";
import { IdempotencyConflict, requestHash } from "../lib/email-outbox";
import {
  EmailValidationError, UUID_PATTERN, menuMessage, shoppingMessage,
  validateMenu, validateRecipient, validateShopping,
} from "../lib/email-content";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function handleError(err: unknown, res: Response): void {
  if (err instanceof EmailValidationError) {
    res.status(400).json({ error: err.message });
  } else if (err instanceof IdempotencyConflict) {
    res.status(409).json({ error: "Esta clave ya se utilizó con otro contenido. Crea un envío nuevo." });
  } else {
    logger.error("Email outbox request failed");
    res.status(503).json({ error: "El servicio de email no está disponible. Reintenta con la misma clave." });
  }
}

router.use("/email", (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!emailOutboxReady()) {
    res.status(503).json({ error: "El servicio de email se está iniciando. Reintenta en unos segundos." });
    return;
  }
  next();
});

for (const kind of ["menu", "shopping"] as const) {
  router.post(`/email/${kind}`, async (req: AuthenticatedRequest, res) => {
    try {
      const key = req.get("Idempotency-Key");
      if (!key) {
        res.status(428).json({ error: "Actualiza la aplicación para enviar emails de forma segura (falta Idempotency-Key)." });
        return;
      }
      if (!UUID_PATTERN.test(key)) throw new EmailValidationError("Idempotency-Key debe ser un UUID válido");
      const payload: unknown = req.body;
      if (kind === "menu") validateMenu(payload);
      else validateShopping(payload);
      const hash = requestHash(kind, payload);
      const userId = req.user!.id;
      // Resolve duplicates before reading today's profile or rebuilding the PDF.
      const existing = await emailRepository.findKey(userId, key, hash);
      if (existing) {
        res.status(202).json(existing);
        return;
      }
      const [user] = await db.select({ email: usersTable.email }).from(usersTable).where(eq(usersTable.id, userId));
      const recipient = user?.email;
      validateRecipient(recipient);
      let snapshot;
      if (kind === "menu") {
        validateMenu(payload);
        snapshot = menuMessage(payload, recipient, generateMenuPdf);
      } else {
        validateShopping(payload);
        snapshot = shoppingMessage(payload, recipient);
      }
      const delivery = await emailRepository.enqueue(userId, key, hash, snapshot);
      logger.info({ jobId: delivery.id, userId }, "Email snapshot committed");
      res.status(202).json(delivery);
    } catch (err) { handleError(err, res); }
  });
}

router.get("/email/deliveries", async (req: AuthenticatedRequest, res) => {
  try { res.json(await emailRepository.list(req.user!.id)); }
  catch (err) { handleError(err, res); }
});

router.get("/email/deliveries/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    if (!UUID_PATTERN.test(id)) throw new EmailValidationError("Identificador de envío no válido");
    const delivery = await emailRepository.get(req.user!.id, id);
    if (!delivery) { res.status(404).json({ error: "Envío no encontrado" }); return; }
    res.json(delivery);
  } catch (err) { handleError(err, res); }
});

router.post("/email/deliveries/:id/retry", async (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id);
    if (!UUID_PATTERN.test(id)) throw new EmailValidationError("Identificador de envío no válido");
    const delivery = await emailRepository.retry(req.user!.id, id);
    if (delivery) { res.status(202).json(delivery); return; }
    const existing = await emailRepository.get(req.user!.id, id);
    if (!existing) { res.status(404).json({ error: "Envío no encontrado" }); return; }
    res.status(409).json({ error: "Solo se pueden reintentar envíos fallidos" });
  } catch (err) { handleError(err, res); }
});

export default router;
