import { createHash, randomBytes } from "node:crypto";
import { pool } from "@workspace/db";
import { normalizeIngredient, parseShoppingCommand, WHATSAPP_HELP, type IncomingWhatsAppMessage } from "./whatsapp";

/**
 * Reads the products of a photographed shopping list. Returns null when the
 * photo cannot be read at all (unsupported format), so the user gets a hint
 * instead of endless retries.
 */
export type ImageListReader = (mediaId: string) => Promise<string[] | null>;

export const hashLinkCode = (code: string): string => createHash("sha256").update(code).digest("hex");

export async function initializeWhatsApp(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_links (
      user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone text UNIQUE,
      code_hash text UNIQUE,
      code_expires_at timestamptz
    );
    CREATE TABLE IF NOT EXISTS whatsapp_ingredients (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ingredient text NOT NULL,
      normalized text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(user_id, normalized)
    );
    CREATE TABLE IF NOT EXISTS whatsapp_messages (
      id text PRIMARY KEY,
      phone text NOT NULL,
      body text NOT NULL,
      state text NOT NULL DEFAULT 'pending',
      reply text,
      attempts integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS whatsapp_messages_queue ON whatsapp_messages(state, updated_at);
    ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS media_id text;
  `);
}

export async function createLinkCode(userId: number): Promise<string> {
  const code = randomBytes(16).toString("hex");
  await pool.query(`
    INSERT INTO whatsapp_links(user_id, code_hash, code_expires_at) VALUES ($1, $2, now() + interval '10 minutes')
    ON CONFLICT(user_id) DO UPDATE SET code_hash = EXCLUDED.code_hash, code_expires_at = EXCLUDED.code_expires_at
  `, [userId, hashLinkCode(code)]);
  return code;
}

export async function enqueueWhatsApp(messages: IncomingWhatsAppMessage[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const message of messages) {
      await client.query(`
        INSERT INTO whatsapp_messages(id, phone, body, media_id) VALUES ($1, $2, $3, $4) ON CONFLICT(id) DO NOTHING
      `, [message.id, message.phone, message.text, message.mediaId ?? null]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export interface WhatsAppJob {
  id: string;
  phone: string;
  body: string;
  /** Photo of a shopping list, until the job is processed. */
  mediaId?: string | null;
  reply: string | null;
  attempts: number;
}

export async function claimWhatsAppJob(): Promise<WhatsAppJob | undefined> {
  await pool.query(`
    UPDATE whatsapp_messages SET state = 'failed', updated_at = now()
    WHERE state IN ('pending', 'reply', 'sending', 'processing')
      AND updated_at < now() - interval '1 minute'
      AND (created_at < now() - interval '23 hours' OR attempts >= 5)
  `);
  const { rows } = await pool.query<WhatsAppJob>(`
    UPDATE whatsapp_messages SET
      state = CASE WHEN reply IS NULL THEN 'processing' ELSE 'sending' END,
      attempts = attempts + 1, updated_at = now()
    WHERE id = (
      SELECT id FROM whatsapp_messages
      WHERE state = 'pending'
        OR (state = 'reply' AND updated_at < now() - interval '30 seconds')
        OR (state = 'sending' AND updated_at < now() - interval '1 minute')
        OR (state = 'processing' AND updated_at < now() - interval '1 minute')
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
    )
    RETURNING id, phone, body, media_id AS "mediaId", reply, attempts
  `);
  return rows[0];
}

/** Attempts before a photo that keeps failing to download or read gets an apology instead of a retry. */
const IMAGE_ATTEMPTS = 3;

async function readListPhoto(job: WhatsAppJob, readImage: ImageListReader | undefined): Promise<string[] | "unreadable" | "failed" | undefined> {
  if (!job.mediaId || job.reply || !readImage) return undefined;
  // Unlinked phones get the usual linking hint without downloading anything.
  const { rowCount } = await pool.query("SELECT 1 FROM whatsapp_links WHERE phone = $1", [job.phone]);
  if (!rowCount) return undefined;
  try {
    return await readImage(job.mediaId) ?? "unreadable";
  } catch (error) {
    if (job.attempts < IMAGE_ATTEMPTS) throw error;
    return "failed";
  }
}

export async function processWhatsAppCommand(job: WhatsAppJob, readImage?: ImageListReader): Promise<string> {
  // Downloading and reading a photo takes seconds: do it before locking anything.
  const photo = await readListPhoto(job, readImage);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: [current] } = await client.query<WhatsAppJob>(
      "SELECT reply FROM whatsapp_messages WHERE id = $1 FOR UPDATE", [job.id],
    );
    if (current?.reply) {
      await client.query("COMMIT");
      return current.reply;
    }
    const caption = parseShoppingCommand(job.body);
    const command = job.mediaId
      ? Array.isArray(photo)
        ? { kind: "list" as const, ingredients: [...photo, ...(caption.kind === "list" ? caption.ingredients : [])] }
        : { kind: "photo" as const, problem: photo }
      : caption;
    let reply = WHATSAPP_HELP;
    if (command.kind === "link") {
      // Serialize link/unlink and ingredient writes for the same sender.
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [job.phone]);
      const { rows: existing } = await client.query(
        "SELECT user_id FROM whatsapp_links WHERE phone = $1", [job.phone],
      );
      if (existing.length) {
        reply = "Este teléfono ya está vinculado. Desvincúlalo desde la web antes de cambiar de cuenta.";
      } else {
        const { rowCount } = await client.query(`
          UPDATE whatsapp_links SET phone = $1, code_hash = NULL, code_expires_at = NULL
          WHERE code_hash = $2 AND code_expires_at > now() AND phone IS NULL
        `, [job.phone, hashLinkCode(command.code)]);
        reply = rowCount
          ? 'Cuenta vinculada. Ya puedes enviar "añade leche y huevos".'
          : "Código inválido o caducado. Genera uno nuevo en la web.";
      }
    } else if (command.kind === "photo") {
      const { rows: [link] } = await client.query("SELECT user_id FROM whatsapp_links WHERE phone = $1", [job.phone]);
      if (!link) reply = "Vincula primero tu teléfono desde la sección WhatsApp de la lista de la compra en la web.";
      else if (command.problem === "unreadable") reply = "No puedo leer ese tipo de archivo. Envía la lista como foto (JPG o PNG) o escribe «añade …».";
      else reply = "No he podido leer la foto ahora mismo. Inténtalo de nuevo en un rato o escribe «añade …».";
    } else if (command.kind === "list") {
      const { rows: [link] } = await client.query<{ user_id: number }>(
        "SELECT user_id FROM whatsapp_links WHERE phone = $1 FOR UPDATE", [job.phone],
      );
      if (!link) {
        reply = "Vincula primero tu teléfono desde la sección WhatsApp de la lista de la compra en la web.";
      } else {
        const added: string[] = [];
        const existing: string[] = [];
        for (const ingredient of command.ingredients) {
          const { rowCount } = await client.query(`
            INSERT INTO whatsapp_ingredients(user_id, ingredient, normalized) VALUES ($1, $2, $3)
            ON CONFLICT(user_id, normalized) DO NOTHING
          `, [link.user_id, ingredient, normalizeIngredient(ingredient)]);
          (rowCount ? added : existing).push(ingredient);
        }
        reply = [
          job.mediaId && command.ingredients.length === 0
            ? "No he encontrado productos en la foto. Prueba con una foto más cerca y con buena luz, o escribe «añade …»."
            : "",
          job.mediaId && command.ingredients.length > 0 ? "He leído tu lista." : "",
          added.length ? `Añadido a tu lista de la compra: ${added.join(", ")}.` : "",
          existing.length ? `Ya estaba en tus ingredientes de WhatsApp: ${existing.join(", ")}.` : "",
        ].filter(Boolean).join("\n");
      }
    }
    // Checkpoint the effect and its reply together, so retries cannot re-add removed items.
    await client.query(
      "UPDATE whatsapp_messages SET reply = $2, body = '', media_id = NULL, state = 'sending', updated_at = now() WHERE id = $1",
      [job.id, reply],
    );
    await client.query("COMMIT");
    return reply;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listWhatsAppIngredients(userId: number): Promise<{ id: number; ingredient: string }[]> {
  const { rows } = await pool.query<{ id: number; ingredient: string }>(
    "SELECT id, ingredient FROM whatsapp_ingredients WHERE user_id = $1 ORDER BY id", [userId],
  );
  return rows;
}
