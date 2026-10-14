import { pgTable, text, integer, serial, timestamp, unique, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const whatsappLinksTable = pgTable("whatsapp_links", {
  userId: integer("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  phone: text("phone").unique(),
  codeHash: text("code_hash").unique(),
  codeExpiresAt: timestamp("code_expires_at", { withTimezone: true }),
});

export const whatsappIngredientsTable = pgTable("whatsapp_ingredients", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  ingredient: text("ingredient").notNull(),
  normalized: text("normalized").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [unique().on(table.userId, table.normalized)]);

export const whatsappMessagesTable = pgTable("whatsapp_messages", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  body: text("body").notNull(),
  state: text("state").notNull().default("pending"),
  reply: text("reply"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [index("whatsapp_messages_queue").on(table.state, table.updatedAt)]);
