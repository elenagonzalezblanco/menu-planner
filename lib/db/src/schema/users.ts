import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatar: text("avatar").notNull().default("👩‍🍳"),
  email: text("email"),
  passwordHash: text("password_hash"),
  mercadonaEmail: text("mercadona_email"),
  azureEndpoint: text("azure_endpoint"),
  azureDeployment: text("azure_deployment"),
  azureApiKey: text("azure_api_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
