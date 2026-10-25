import { pgTable, text, integer, serial, timestamp, jsonb, primaryKey, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

// Created at startup by the API (CREATE TABLE IF NOT EXISTS in mercadona-store.ts).

export const mercadonaConnectorsTable = pgTable("mercadona_connectors", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
}, table => [index("mercadona_connectors_user").on(table.userId)]);

export type MercadonaOrderLine = {
  productId: string;
  name: string;
  quantity: number;
  category?: string | null;
  unitPrice?: string | null;
  thumbnail?: string | null;
};

export const mercadonaOrdersTable = pgTable("mercadona_orders", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  orderId: text("order_id").notNull(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }).notNull(),
  status: text("status").notNull(),
  total: text("total"),
  lines: jsonb("lines").notNull().$type<MercadonaOrderLine[]>(),
  syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.userId, table.orderId] })]);

export const mercadonaCartPlansTable = pgTable("mercadona_cart_plans", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  menuId: integer("menu_id"),
  menuLabel: text("menu_label"),
  extraIngredients: text("extra_ingredients").array().notNull().default([]),
  plan: jsonb("plan").notNull(),
  status: text("status").notNull().default("pending"),
  result: jsonb("result"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
}, table => [index("mercadona_cart_plans_user").on(table.userId, table.createdAt)]);
