import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const recipesTable = pgTable("recipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  ingredients: text("ingredients").array().notNull().default([]),
  instructions: text("instructions").default(""),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertRecipeSchema = createInsertSchema(recipesTable).omit({ id: true, createdAt: true });
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type Recipe = typeof recipesTable.$inferSelect;
