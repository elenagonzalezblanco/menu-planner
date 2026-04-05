import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Simple user-identification middleware.
 * Expects `X-User-Id: <numeric_id>` header on every request.
 * Attaches the verified user to `req.user`.
 *
 * For production, replace with Azure AD B2C / Entra ID JWT validation.
 */
export interface AuthenticatedRequest extends Request {
  user?: { id: number; name: string };
}

export async function requireUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userIdHeader = req.headers["x-user-id"];
  if (!userIdHeader) {
    res.status(401).json({ error: "Missing X-User-Id header" });
    return;
  }

  const userId = parseInt(String(userIdHeader), 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid X-User-Id header" });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  req.user = user;
  next();
}
