import { pgTable, serial, timestamp, jsonb, integer, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const weeklyMenusTable = pgTable("weekly_menus", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  days: jsonb("days").notNull().$type<WeeklyMenuDay[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const savedMenusTable = pgTable("saved_menus", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  days: jsonb("days").notNull().$type<WeeklyMenuDay[]>(),
  savedAt: timestamp("saved_at").defaultNow().notNull(),
});

export type WeeklyMenuDay = {
  day: string;
  lunch: { primero?: { id: number; name: string } | null; segundo?: { id: number; name: string } | null };
  dinner: { primero?: { id: number; name: string } | null; segundo?: { id: number; name: string } | null };
};

export const insertWeeklyMenuSchema = createInsertSchema(weeklyMenusTable).omit({ id: true, createdAt: true });
export type InsertWeeklyMenu = z.infer<typeof insertWeeklyMenuSchema>;
export type WeeklyMenu = typeof weeklyMenusTable.$inferSelect;
export type SavedMenu = typeof savedMenusTable.$inferSelect;
