import { createHash, randomUUID } from "node:crypto";
import type { EmailMessage } from "@azure/communication-email";

export type DeliveryStatus = "queued" | "sending" | "succeeded" | "failed";
export interface Delivery {
  id: string;
  status: DeliveryStatus;
  recipient: string;
  error: string | null;
}
export interface EmailJob extends Delivery {
  user_id: number;
  operation_id: string;
  snapshot: EmailMessage;
  resume_from: string | null;
  provider_started: boolean;
  terminal_failure: boolean;
  attempts: number;
  lease_token: string;
}
export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>;
}
export function publicDelivery(job: Delivery): Delivery {
  return { id: job.id, status: job.status, recipient: job.recipient, error: job.error };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
export function requestHash(kind: string, payload: unknown): string {
  return createHash("sha256").update(canonical({ kind, payload })).digest("hex");
}

export class IdempotencyConflict extends Error {}
export class EmailConfigurationError extends Error {}
export const UNKNOWN_ERROR = "No se ha podido confirmar el envío. Reintenta para consultar la misma operación; no crees un envío nuevo sin comprobar tu correo.";
export const PROVIDER_ERROR = "El proveedor ha rechazado el envío. Comprueba la dirección de correo y la configuración del servicio antes de reintentar.";
export const MAX_ATTEMPTS = 30;
export function retryDelay(attempt: number): number {
  return Math.min(300_000, 2_000 * 2 ** Math.min(attempt - 1, 8));
}

export class EmailRepository {
  constructor(private readonly db: Queryable) {}

  async initialize(): Promise<void> {
    // One statement, one transaction and a cross-replica migration lock. This runs
    // after base migrations even when the users table already exists.
    await this.db.query(`
      DO $migration$
      BEGIN
        PERFORM pg_advisory_xact_lock(68139402);
        CREATE TABLE IF NOT EXISTS email_deliveries (
          id uuid PRIMARY KEY,
          user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          idempotency_key uuid NOT NULL,
          request_hash text NOT NULL,
          recipient text NOT NULL,
          snapshot jsonb NOT NULL,
          status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','succeeded','failed')),
          operation_id uuid NOT NULL,
          resume_from text,
          provider_started boolean NOT NULL DEFAULT false,
          terminal_failure boolean NOT NULL DEFAULT false,
          attempts integer NOT NULL DEFAULT 0,
          error text,
          next_attempt_at timestamptz NOT NULL DEFAULT now(),
          lease_until timestamptz,
          lease_token uuid,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          UNIQUE (user_id, idempotency_key)
        );
        CREATE INDEX IF NOT EXISTS email_deliveries_pending ON email_deliveries(next_attempt_at)
          WHERE status IN ('queued', 'sending');
        CREATE INDEX IF NOT EXISTS email_deliveries_user ON email_deliveries(user_id, created_at DESC);
      END $migration$;
    `);
  }

  async findKey(userId: number, key: string, hash: string): Promise<Delivery | undefined> {
    const { rows } = await this.db.query(
      "SELECT id, status, recipient, error, request_hash FROM email_deliveries WHERE user_id=$1 AND idempotency_key=$2",
      [userId, key],
    );
    if (!rows[0]) return undefined;
    if (rows[0].request_hash !== hash) throw new IdempotencyConflict();
    return publicDelivery(rows[0]);
  }

  async enqueue(userId: number, key: string, hash: string, snapshot: EmailMessage): Promise<Delivery> {
    const { rows } = await this.db.query(`
      INSERT INTO email_deliveries (id,user_id,idempotency_key,request_hash,recipient,snapshot,operation_id)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7)
      ON CONFLICT (user_id,idempotency_key) DO NOTHING
      RETURNING id,status,recipient,error`,
    [randomUUID(), userId, key, hash, snapshot.recipients.to![0]!.address, JSON.stringify(snapshot), randomUUID()]);
    if (rows[0]) return publicDelivery(rows[0]);
    const existing = await this.findKey(userId, key, hash);
    if (!existing) throw new Error("Outbox insert conflict without row");
    return existing;
  }

  async list(userId: number): Promise<Delivery[]> {
    const { rows } = await this.db.query(
      `SELECT id,status,recipient,error FROM email_deliveries WHERE user_id=$1
       ORDER BY CASE WHEN status IN ('queued','sending') THEN 0 WHEN status='failed' THEN 1 ELSE 2 END,
         created_at DESC, id DESC LIMIT 20`,
      [userId],
    );
    return rows.map(publicDelivery);
  }

  async get(userId: number, id: string): Promise<Delivery | undefined> {
    const { rows } = await this.db.query(
      "SELECT id,status,recipient,error FROM email_deliveries WHERE user_id=$1 AND id=$2", [userId, id],
    );
    return rows[0] && publicDelivery(rows[0]);
  }

  async retry(userId: number, id: string): Promise<Delivery | undefined> {
    const { rows } = await this.db.query(`
      UPDATE email_deliveries SET status='queued', attempts=0, error=NULL,
        operation_id=CASE WHEN terminal_failure THEN $3::uuid ELSE operation_id END,
        resume_from=CASE WHEN terminal_failure THEN NULL ELSE resume_from END,
        provider_started=CASE WHEN terminal_failure THEN false ELSE provider_started END,
        terminal_failure=false, next_attempt_at=now(), lease_until=NULL, lease_token=NULL, updated_at=now()
      WHERE user_id=$1 AND id=$2 AND status='failed'
      RETURNING id,status,recipient,error`, [userId, id, randomUUID()]);
    return rows[0] && publicDelivery(rows[0]);
  }

  async claim(): Promise<EmailJob | undefined> {
    const { rows } = await this.db.query(`
      WITH candidate AS (
        SELECT id FROM email_deliveries
        WHERE status IN ('queued','sending') AND next_attempt_at<=now()
          AND (lease_until IS NULL OR lease_until<=now())
        ORDER BY next_attempt_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1
      )
      UPDATE email_deliveries d SET status='sending', lease_token=$1,
        lease_until=now()+interval '90 seconds', attempts=attempts+1, updated_at=now()
      FROM candidate WHERE d.id=candidate.id RETURNING d.*`, [randomUUID()]);
    return rows[0];
  }

  async prepare(job: EmailJob, resumeFrom: string): Promise<boolean> {
    const result = await this.db.query(`
      UPDATE email_deliveries SET provider_started=true,resume_from=$3,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='sending'`,
    [job.id, job.lease_token, resumeFrom]);
    return result.rowCount === 1;
  }

  async finish(job: EmailJob, outcome: ProviderOutcome): Promise<void> {
    const exhausted = job.attempts >= MAX_ATTEMPTS;
    const status = outcome.status === "succeeded" ? "succeeded"
      : outcome.status === "failed" || exhausted ? "failed" : "sending";
    await this.db.query(`
      UPDATE email_deliveries SET status=$3,error=$4,resume_from=$5,
        terminal_failure=$6,provider_started=$7,
        next_attempt_at=now()+($8 * interval '1 millisecond'),
        lease_until=NULL,lease_token=NULL,updated_at=now()
      WHERE id=$1 AND lease_token=$2 AND lease_until>now() AND status='sending'`,
    [job.id, job.lease_token, status,
      status === "failed" ? (outcome.terminal ? PROVIDER_ERROR : UNKNOWN_ERROR) : null,
      outcome.resumeFrom ?? job.resume_from, outcome.terminal ?? false,
      outcome.resubmit ? false : job.provider_started,
      outcome.status === "pending" ? 10_000 : retryDelay(job.attempts)]);
  }
}

export interface ProviderOutcome {
  status: "succeeded" | "failed" | "pending" | "transient";
  resumeFrom?: string;
  terminal?: boolean;
  resubmit?: boolean;
}
export interface EmailProvider {
  checkpoint(operationId: string): string;
  step(job: EmailJob, submit: boolean): Promise<ProviderOutcome>;
}
export interface WorkerRepository {
  claim(): Promise<EmailJob | undefined>;
  prepare(job: EmailJob, resumeFrom: string): Promise<boolean>;
  finish(job: EmailJob, outcome: ProviderOutcome): Promise<void>;
}

export async function processEmail(
  repo: WorkerRepository,
  provider: EmailProvider,
  log: (fields: { jobId: string; operationId: string; event: string }) => void,
): Promise<boolean> {
  const job = await repo.claim();
  if (!job) return false;
  const record = (event: string) => log({ jobId: job.id, operationId: job.operation_id, event });
  if (job.attempts > MAX_ATTEMPTS) {
    await repo.finish(job, { status: "failed" });
    record("attempts-exhausted");
    return true;
  }
  const submit = !job.provider_started;
  try {
    const checkpoint = job.resume_from ?? provider.checkpoint(job.operation_id);
    if (!await repo.prepare(job, checkpoint)) return true;
    job.resume_from = checkpoint;
    job.provider_started = true;
    const outcome = await provider.step(job, submit);
    await repo.finish(job, outcome);
    record(outcome.status);
  } catch (error) {
    // A lost DB acknowledgement or network exception is never evidence of
    // provider failure. Preserve the same operation and checkpoint.
    record(error instanceof EmailConfigurationError ? "configuration-error" : "worker-attempt-error");
    await repo.finish(job, error instanceof EmailConfigurationError
      ? { status: "failed", terminal: true } : { status: "transient" });
  }
  return true;
}
