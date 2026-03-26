import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";

export const mercadonaSettingsTable = pgTable("mercadona_settings", {
  id: serial("id").primaryKey(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  postalCode: text("postal_code").notNull().default("28001"),
  sessionToken: text("session_token"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MercadonaSettings = typeof mercadonaSettingsTable.$inferSelect;
