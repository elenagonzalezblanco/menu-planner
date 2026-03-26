import { pgTable, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const weeklyMenusTable = pgTable("weekly_menus", {
  id: serial("id").primaryKey(),
  days: jsonb("days").notNull().$type<WeeklyMenuDay[]>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type WeeklyMenuDay = {
  day: string;
  lunch: { primero?: { id: number; name: string } | null; segundo?: { id: number; name: string } | null };
  dinner: { primero?: { id: number; name: string } | null; segundo?: { id: number; name: string } | null };
};

export const insertWeeklyMenuSchema = createInsertSchema(weeklyMenusTable).omit({ id: true, createdAt: true });
export type InsertWeeklyMenu = z.infer<typeof insertWeeklyMenuSchema>;
export type WeeklyMenu = typeof weeklyMenusTable.$inferSelect;
