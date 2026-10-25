import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import type { CartPlan, PurchaseLine, PurchaseOrder } from "./mercadona-planner";

export const hashConnectorToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** Purchase history older than this is ignored when learning habits. */
export const HISTORY_DAYS = 365;
export const MAX_ORDERS_PER_UPLOAD = 60;
const MAX_LINES_PER_ORDER = 400;

export async function initializeMercadona(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mercadona_connectors (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash text NOT NULL UNIQUE,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_used_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS mercadona_connectors_user ON mercadona_connectors(user_id);
    CREATE TABLE IF NOT EXISTS mercadona_orders (
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id text NOT NULL,
      delivered_at timestamptz NOT NULL,
      status text NOT NULL,
      total text,
      lines jsonb NOT NULL,
      synced_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, order_id)
    );
    CREATE TABLE IF NOT EXISTS mercadona_cart_plans (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu_id integer,
      menu_label text,
      extra_ingredients text[] NOT NULL DEFAULT '{}',
      plan jsonb NOT NULL,
      status text NOT NULL DEFAULT 'pending',
      result jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      applied_at timestamptz
    );
    CREATE INDEX IF NOT EXISTS mercadona_cart_plans_user ON mercadona_cart_plans(user_id, created_at DESC);
  `);
}

// ── Connector token ──────────────────────────────────────────────────────────

/** One token per device/bookmark; the oldest ones are retired so a lost bookmark does not live forever. */
export async function createConnectorToken(userId: number): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await pool.query("INSERT INTO mercadona_connectors(user_id, token_hash) VALUES ($1, $2)", [userId, hashConnectorToken(token)]);
  await pool.query(`
    DELETE FROM mercadona_connectors WHERE user_id = $1 AND id NOT IN (
      SELECT id FROM mercadona_connectors WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 5
    )
  `, [userId]);
  return token;
}

export async function revokeConnectorTokens(userId: number): Promise<void> {
  await pool.query("DELETE FROM mercadona_connectors WHERE user_id = $1", [userId]);
}

export async function userForConnectorToken(token: string): Promise<{ id: number; name: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { rows } = await pool.query<{ id: number; name: string }>(`
    UPDATE mercadona_connectors c SET last_used_at = now()
    FROM users u WHERE c.token_hash = $1 AND u.id = c.user_id
    RETURNING u.id, u.name
  `, [hashConnectorToken(token)]);
  return rows[0] ?? null;
}

// ── Purchase history ─────────────────────────────────────────────────────────

export interface UploadedOrder {
  orderId: string;
  deliveredAt: string;
  status: string;
  total: string | null;
  lines: PurchaseLine[];
}

const text = (value: unknown, max: number): string | null =>
  typeof value === "string" && value.trim() && value.length <= max ? value.trim() : null;

/** Validates connector uploads; anything malformed is rejected rather than half-stored. */
export function parseUploadedOrders(body: unknown): UploadedOrder[] | null {
  const orders = (body as { orders?: unknown } | null)?.orders;
  if (!Array.isArray(orders) || orders.length === 0 || orders.length > MAX_ORDERS_PER_UPLOAD) return null;
  const parsed: UploadedOrder[] = [];
  for (const raw of orders as Array<Record<string, unknown>>) {
    const orderId = text(raw?.orderId, 32);
    const deliveredAt = text(raw?.deliveredAt, 40);
    const status = text(raw?.status, 32);
    if (!orderId || !/^\d+$/.test(orderId) || !deliveredAt || Number.isNaN(Date.parse(deliveredAt)) || !status) return null;
    if (!Array.isArray(raw.lines) || raw.lines.length > MAX_LINES_PER_ORDER) return null;
    const lines: PurchaseLine[] = [];
    for (const line of raw.lines as Array<Record<string, unknown>>) {
      const productId = text(line?.productId, 32);
      const name = text(line?.name, 300);
      const quantity = Number(line?.quantity);
      if (!productId || !name || !Number.isFinite(quantity) || quantity < 0 || quantity > 999) return null;
      const thumbnail = text(line.thumbnail, 500);
      lines.push({
        productId,
        name,
        quantity,
        category: text(line.category, 200),
        unitPrice: text(line.unitPrice, 20),
        thumbnail: thumbnail && thumbnail.startsWith("https://") ? thumbnail : null,
      });
    }
    const total = raw.total === null || raw.total === undefined ? null : text(String(raw.total), 20);
    parsed.push({ orderId, deliveredAt: new Date(deliveredAt).toISOString(), status, total, lines });
  }
  return parsed;
}

export async function storeOrders(userId: number, orders: UploadedOrder[]): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const order of orders) {
      await client.query(`
        INSERT INTO mercadona_orders(user_id, order_id, delivered_at, status, total, lines)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT(user_id, order_id) DO UPDATE SET
          delivered_at = EXCLUDED.delivered_at, status = EXCLUDED.status, total = EXCLUDED.total,
          lines = EXCLUDED.lines, synced_at = now()
      `, [userId, order.orderId, order.deliveredAt, order.status, order.total, JSON.stringify(order.lines)]);
    }
    await client.query("COMMIT");
    return orders.length;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncedOrderIds(userId: number): Promise<string[]> {
  const { rows } = await pool.query<{ order_id: string }>(
    "SELECT order_id FROM mercadona_orders WHERE user_id = $1 ORDER BY delivered_at DESC", [userId]);
  return rows.map(row => row.order_id);
}

export async function loadPurchaseHistory(userId: number): Promise<PurchaseOrder[]> {
  const { rows } = await pool.query<{ order_id: string; delivered_at: Date; lines: PurchaseLine[] }>(`
    SELECT order_id, delivered_at, lines FROM mercadona_orders
    WHERE user_id = $1 AND status = 'delivered' AND delivered_at >= now() - ($2 || ' days')::interval
    ORDER BY delivered_at
  `, [userId, String(HISTORY_DAYS)]);
  return rows.map(row => ({ orderId: row.order_id, deliveredAt: row.delivered_at.toISOString(), lines: row.lines }));
}

export async function deleteHistory(userId: number): Promise<void> {
  await pool.query("DELETE FROM mercadona_orders WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM mercadona_cart_plans WHERE user_id = $1", [userId]);
}

// ── Cart plans ───────────────────────────────────────────────────────────────

export interface CartPlanResult {
  added: Array<{ productId: string; productName: string; quantity: number }>;
  kept: Array<{ productId: string; productName: string; quantity: number }>;
  missing: Array<{ ingredients: string[]; reason: string }>;
  cartTotal: string | null;
}

export interface StoredCartPlan extends CartPlan {
  id: number;
  menuId: number | null;
  menuLabel: string | null;
  extraIngredients: string[];
  status: "pending" | "applied";
  result: CartPlanResult | null;
  createdAt: string;
  appliedAt: string | null;
}

interface PlanRow {
  id: number;
  menu_id: number | null;
  menu_label: string | null;
  extra_ingredients: string[];
  plan: CartPlan;
  status: "pending" | "applied";
  result: CartPlanResult | null;
  created_at: Date;
  applied_at: Date | null;
}

const toStoredPlan = (row: PlanRow): StoredCartPlan => ({
  ...row.plan,
  id: row.id,
  menuId: row.menu_id,
  menuLabel: row.menu_label,
  extraIngredients: row.extra_ingredients,
  status: row.status,
  result: row.result,
  createdAt: row.created_at.toISOString(),
  appliedAt: row.applied_at?.toISOString() ?? null,
});

export async function savePlan(
  userId: number, menuId: number | null, menuLabel: string | null, extraIngredients: string[], plan: CartPlan,
): Promise<StoredCartPlan> {
  const { rows } = await pool.query<PlanRow>(`
    INSERT INTO mercadona_cart_plans(user_id, menu_id, menu_label, extra_ingredients, plan)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [userId, menuId, menuLabel, extraIngredients, JSON.stringify(plan)]);
  // Keep the table small: plans are only useful as a recent log.
  await pool.query(`
    DELETE FROM mercadona_cart_plans WHERE user_id = $1 AND id NOT IN (
      SELECT id FROM mercadona_cart_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10
    )
  `, [userId]);
  return toStoredPlan(rows[0]);
}

export async function latestPlan(userId: number): Promise<StoredCartPlan | null> {
  const { rows } = await pool.query<PlanRow>(
    "SELECT * FROM mercadona_cart_plans WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1", [userId]);
  return rows[0] ? toStoredPlan(rows[0]) : null;
}

export async function recordPlanResult(userId: number, planId: number, result: CartPlanResult): Promise<boolean> {
  const { rowCount } = await pool.query(`
    UPDATE mercadona_cart_plans SET status = 'applied', result = $3, applied_at = now()
    WHERE id = $1 AND user_id = $2
  `, [planId, userId, JSON.stringify(result)]);
  return (rowCount ?? 0) > 0;
}

export function parsePlanResult(body: unknown): CartPlanResult | null {
  const raw = body as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") return null;
  const products = (value: unknown) => Array.isArray(value)
    ? value.slice(0, 300).map(item => {
      const entry = item as Record<string, unknown>;
      return { productId: String(entry?.productId ?? "").slice(0, 32), productName: String(entry?.productName ?? "").slice(0, 300), quantity: Number(entry?.quantity) || 0 };
    })
    : [];
  const missing = Array.isArray(raw.missing)
    ? raw.missing.slice(0, 300).map(item => {
      const entry = item as Record<string, unknown>;
      return {
        ingredients: Array.isArray(entry?.ingredients) ? entry.ingredients.slice(0, 10).map(value => String(value).slice(0, 200)) : [],
        reason: String(entry?.reason ?? "").slice(0, 500),
      };
    })
    : [];
  return { added: products(raw.added), kept: products(raw.kept), missing, cartTotal: text(String(raw.cartTotal ?? ""), 20) };
}

export async function connectorStatus(userId: number) {
  const [connector, history, plan] = await Promise.all([
    pool.query<{ created_at: Date; last_used_at: Date | null }>(
      "SELECT min(created_at) AS created_at, max(last_used_at) AS last_used_at FROM mercadona_connectors WHERE user_id = $1 HAVING count(*) > 0",
      [userId]),
    pool.query<{ orders: string; first_at: Date | null; last_at: Date | null; synced_at: Date | null }>(`
      SELECT count(*) AS orders, min(delivered_at) AS first_at, max(delivered_at) AS last_at, max(synced_at) AS synced_at
      FROM mercadona_orders WHERE user_id = $1
    `, [userId]),
    latestPlan(userId),
  ]);
  const summary = history.rows[0];
  return {
    connected: connector.rows.length > 0,
    connectedAt: connector.rows[0]?.created_at.toISOString() ?? null,
    lastUsedAt: connector.rows[0]?.last_used_at?.toISOString() ?? null,
    history: {
      orders: Number(summary?.orders ?? 0),
      firstOrderAt: summary?.first_at?.toISOString() ?? null,
      lastOrderAt: summary?.last_at?.toISOString() ?? null,
      lastSyncAt: summary?.synced_at?.toISOString() ?? null,
    },
    latestPlan: plan,
  };
}
