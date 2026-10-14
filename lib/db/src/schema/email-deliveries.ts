import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Keep this declaration aligned with EmailRepository.initialize so schema-push
// tooling recognizes the durable outbox instead of proposing to remove it.
export const emailDeliveriesTable = pgTable("email_deliveries", {
  id: uuid("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  requestHash: text("request_hash").notNull(),
  recipient: text("recipient").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  status: text("status").notNull().default("queued"),
  operationId: uuid("operation_id").notNull(),
  resumeFrom: text("resume_from"),
  providerStarted: boolean("provider_started").notNull().default(false),
  terminalFailure: boolean("terminal_failure").notNull().default(false),
  attempts: integer("attempts").notNull().default(0),
  error: text("error"),
  nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  leaseToken: uuid("lease_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique("email_deliveries_user_id_idempotency_key_key").on(table.userId, table.idempotencyKey),
  check("email_deliveries_status_check", sql`${table.status} IN ('queued','sending','succeeded','failed')`),
  index("email_deliveries_pending").on(table.nextAttemptAt).where(sql`${table.status} IN ('queued','sending')`),
  index("email_deliveries_user").on(table.userId, table.createdAt.desc()),
]);
