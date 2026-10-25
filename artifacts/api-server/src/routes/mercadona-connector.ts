import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";
import type { AuthenticatedRequest } from "../middlewares/auth";
import { computeCartPlan, MenuNotFoundError } from "../lib/mercadona-cart";
import {
  connectorStatus, createConnectorToken, deleteHistory, parsePlanResult, parseUploadedOrders, recordPlanResult,
  revokeConnectorTokens, storeOrders, syncedOrderIds, userForConnectorToken,
} from "../lib/mercadona-store";

type ConnectorRequest = Request & { connectorUser?: { id: number; name: string } };

/**
 * Routes used by the Mercadona bookmarklet (running on tienda.mercadona.es)
 * and by the app itself. Purchase history is personal, so they require the
 * connector token instead of the app's plain X-User-Id header.
 */
export const connectorRouter: IRouter = Router();

connectorRouter.use(async (req: ConnectorRequest, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const user = token ? await userForConnectorToken(token) : null;
  if (!user) return res.status(401).json({ error: "El acceso a Mercadona ha caducado: vuelve a conectarlo desde Mi Cocina." });
  req.connectorUser = user;
  return next();
});

connectorRouter.get("/status", async (req: ConnectorRequest, res) => {
  res.json(await connectorStatus(req.connectorUser!.id));
});

connectorRouter.get("/state", async (req: ConnectorRequest, res) => {
  res.json({ user: { name: req.connectorUser!.name }, syncedOrderIds: await syncedOrderIds(req.connectorUser!.id) });
});

connectorRouter.post("/orders", async (req: ConnectorRequest, res) => {
  const orders = parseUploadedOrders(req.body);
  if (!orders) return res.status(400).json({ error: "Pedidos de Mercadona no válidos." });
  return res.json({ stored: await storeOrders(req.connectorUser!.id, orders) });
});

connectorRouter.post("/plan", async (req: ConnectorRequest, res) => {
  const menuId = req.body?.menuId === undefined || req.body?.menuId === null ? undefined : Number(req.body.menuId);
  if (menuId !== undefined && (!Number.isSafeInteger(menuId) || menuId <= 0)) return res.status(400).json({ error: "Menú no válido." });
  try {
    const plan = await computeCartPlan(req.connectorUser!.id, { menuId });
    return res.json(plan);
  } catch (error) {
    if (error instanceof MenuNotFoundError) return res.status(404).json({ error: "No se encontró el menú." });
    throw error;
  }
});

connectorRouter.post("/plan/:id/result", async (req: ConnectorRequest, res) => {
  const planId = Number(req.params.id);
  const result = parsePlanResult(req.body);
  if (!Number.isSafeInteger(planId) || planId <= 0 || !result) return res.status(400).json({ error: "Resultado no válido." });
  if (!await recordPlanResult(req.connectorUser!.id, planId, result)) return res.status(404).json({ error: "Cesta no encontrada." });
  return res.json({ success: true });
});

connectorRouter.delete("/history", async (req: ConnectorRequest, res) => {
  await deleteHistory(req.connectorUser!.id);
  res.json({ success: true });
});

connectorRouter.post("/disconnect", async (req: ConnectorRequest, res) => {
  await revokeConnectorTokens(req.connectorUser!.id);
  res.json({ success: true });
});

connectorRouter.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  req.log?.error({ errorType: error instanceof Error ? error.name : "unknown" }, "Mercadona connector operation failed");
  res.status(500).json({ error: "No se pudo completar la operación con Mercadona. Inténtalo de nuevo." });
});

/** Creating a connector grants durable access to purchase history, so the account password is required. */
export const mercadonaAccountRouter: IRouter = Router();
const attempts = new Map<number, { count: number; expires: number }>();

mercadonaAccountRouter.post("/mercadona/connector", async (req: AuthenticatedRequest, res, next) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const userId = req.user!.id;
    const now = Date.now();
    for (const [id, entry] of attempts) if (entry.expires < now) attempts.delete(id);
    const entry = attempts.get(userId) ?? { count: 0, expires: now + 60_000 };
    attempts.set(userId, entry);
    if (++entry.count > 5) return res.status(429).json({ error: "Demasiados intentos. Espera un minuto." });
    const password: unknown = req.body?.password;
    if (typeof password !== "string" || password.length === 0 || password.length > 1024) {
      return res.status(400).json({ error: "Introduce la contraseña de tu cuenta de Mi Cocina." });
    }
    const { rows: [user] } = await pool.query<{ password_hash: string | null }>(
      "SELECT password_hash FROM users WHERE id = $1", [userId],
    );
    const hash = createHash("sha256").update("menu-planner-salt-2026" + password).digest("hex");
    if (!user?.password_hash || user.password_hash.length !== hash.length
      || !timingSafeEqual(Buffer.from(hash), Buffer.from(user.password_hash))) {
      return res.status(401).json({ error: "Contraseña incorrecta." });
    }
    attempts.delete(userId);
    return res.json({ token: await createConnectorToken(userId) });
  } catch (error) {
    return next(error);
  }
});
