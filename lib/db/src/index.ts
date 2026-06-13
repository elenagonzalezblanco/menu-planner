import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const isSSL = process.env.DATABASE_URL.includes("render.com") ||
  process.env.DATABASE_URL.includes("ssl=true") ||
  process.env.NODE_ENV === "production";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isSSL ? { rejectUnauthorized: false } : undefined,
  connectionTimeoutMillis: 10000, // fail fast if DB is unreachable
  idleTimeoutMillis: 30000,       // release idle connections after 30s
  max: 5,                          // limit pool size on Free tier
  keepAlive: true,                 // keep TCP sockets alive to avoid mid-idle drops
  allowExitOnIdle: false,          // never let the pool keep the process from staying up
});

// Without this listener, an error on an idle client (e.g. the DB restarting or
// dropping the connection) is emitted as an unhandled 'error' event and would
// crash the whole API process. Swallow it here so the pool can transparently
// reconnect on the next query instead of taking the server down.
pool.on("error", (err) => {
  console.error("[db] idle client error (pool will recover on next query):", err.message);
});

export const db = drizzle(pool, { schema });

export * from "./schema";
