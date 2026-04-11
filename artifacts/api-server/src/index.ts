import app from "./app";
import { logger } from "./lib/logger";
import { seedIfEmpty } from "./lib/seed";
import { pool } from "@workspace/db";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Keep server alive even if a route throws an unhandled error
process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception — server stays up");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled promise rejection — server stays up");
});

async function autoMigrate() {
  const client = await pool.connect();
  try {
    // Check if tables exist
    const { rows } = await client.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users'`
    );
    if (Number(rows[0].cnt) > 0) {
      logger.info("Database tables already exist, running incremental migrations");
      // Add password_hash column if it doesn't exist
      await client.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text`);
      return;
    }
    logger.info("Running initial database migration...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" serial PRIMARY KEY NOT NULL,
        "name" text NOT NULL,
        "avatar" text DEFAULT '👩‍🍳' NOT NULL,
        "email" text,
        "password_hash" text,
        "mercadona_email" text,
        "azure_endpoint" text,
        "azure_deployment" text,
        "azure_api_key" text,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "recipes" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "name" text NOT NULL,
        "category" text NOT NULL,
        "ingredients" text[] DEFAULT '{}' NOT NULL,
        "instructions" text DEFAULT '',
        "created_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "weekly_menus" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "days" jsonb NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "mercadona_settings" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "email" text NOT NULL,
        "password" text NOT NULL,
        "postal_code" text DEFAULT '28001' NOT NULL,
        "session_token" text,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "conversations" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "title" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "messages" (
        "id" serial PRIMARY KEY NOT NULL,
        "conversation_id" integer NOT NULL REFERENCES "conversations"("id") ON DELETE cascade,
        "role" text NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamp with time zone DEFAULT now() NOT NULL
      );
      CREATE TABLE IF NOT EXISTS "saved_menus" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer REFERENCES "users"("id") ON DELETE cascade,
        "label" text NOT NULL,
        "days" jsonb NOT NULL,
        "saved_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    logger.info("Database migration completed");
  } finally {
    client.release();
  }
}

// Start listening immediately, then run migrations in background
app.listen(port, () => {
  logger.info({ port }, "Server listening");
  autoMigrate()
    .then(() => seedIfEmpty())
    .catch((err) => logger.error({ err }, "Migration/seed error"));
});
