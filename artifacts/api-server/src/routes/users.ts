import { Router, type IRouter } from "express";
import { db, usersTable, recipesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { createHash } from "crypto";
import { DEFAULT_RECIPES } from "../lib/seed";

const router: IRouter = Router();

// Simple password hashing (SHA-256 + salt)
function hashPassword(password: string): string {
  const salt = "menu-planner-salt-2026";
  return createHash("sha256").update(salt + password).digest("hex");
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

// List all users
router.get("/users", async (_req, res) => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        avatar: usersTable.avatar,
        email: usersTable.email,
        mercadonaEmail: usersTable.mercadonaEmail,
        azureEndpoint: usersTable.azureEndpoint,
        azureDeployment: usersTable.azureDeployment,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(usersTable.name);
    res.json(users);
  } catch {
    res.status(500).json({ error: "Error fetching users" });
  }
});

// Create user
router.post("/users", async (req, res) => {
  try {
    const { name, avatar, email, password, mercadonaEmail } = req.body;
    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters" });
      return;
    }
    const [user] = await db
      .insert(usersTable)
      .values({
        name: name.trim(),
        avatar: avatar || "👩‍🍳",
        email: email?.trim() || null,
        passwordHash: hashPassword(password),
        mercadonaEmail: mercadonaEmail?.trim() || null,
      })
      .returning();
    // Seed default recipes for the new user
    try {
      const recipesWithUser = DEFAULT_RECIPES.map(r => ({ ...r, userId: user.id }));
      await db.insert(recipesTable).values(recipesWithUser);
    } catch { /* non-fatal — user created but recipes seed failed */ }
    const { passwordHash: _, azureApiKey: _k, ...safe } = user;
    res.status(201).json(safe);
  } catch {
    res.status(500).json({ error: "Error creating user" });
  }
});

// Login — verify email/name + password
router.post("/users/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Email and password are required" });
      return;
    }
    // Find user by email or name
    const users = await db.select().from(usersTable);
    const user = users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase() || u.name.toLowerCase() === email.toLowerCase()
    );
    if (!user || !user.passwordHash) {
      res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      return;
    }
    if (!verifyPassword(password, user.passwordHash)) {
      res.status(401).json({ error: "Usuario o contraseña incorrectos" });
      return;
    }
    const { passwordHash: _, azureApiKey: _k, ...safe } = user;
    res.json(safe);
  } catch {
    res.status(500).json({ error: "Error during login" });
  }
});

// Get single user
router.get("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    // Don't expose azureApiKey
    const { azureApiKey: _, ...safe } = user;
    res.json(safe);
  } catch {
    res.status(500).json({ error: "Error fetching user" });
  }
});

// Update user
router.patch("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    const { name, avatar, email, mercadonaEmail, azureEndpoint, azureDeployment, azureApiKey } = req.body;
    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (avatar !== undefined) updates.avatar = avatar;
    if (email !== undefined) updates.email = email?.trim() || null;
    if (mercadonaEmail !== undefined) updates.mercadonaEmail = mercadonaEmail?.trim() || null;
    if (azureEndpoint !== undefined) updates.azureEndpoint = azureEndpoint?.trim() || null;
    if (azureDeployment !== undefined) updates.azureDeployment = azureDeployment?.trim() || null;
    if (azureApiKey !== undefined) updates.azureApiKey = azureApiKey?.trim() || null;

    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) { res.status(404).json({ error: "User not found" }); return; }
    const { azureApiKey: _, ...safe } = user;
    res.json(safe);
  } catch {
    res.status(500).json({ error: "Error updating user" });
  }
});

// Delete user
router.delete("/users/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid user ID" }); return; }
    await db.delete(usersTable).where(eq(usersTable.id, id));
    res.status(204).send();
  } catch {
    res.status(500).json({ error: "Error deleting user" });
  }
});

export default router;
