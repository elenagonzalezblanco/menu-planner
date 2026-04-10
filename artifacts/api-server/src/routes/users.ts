import { Router, type IRouter } from "express";
import { db, usersTable, recipesTable, passwordResetTokensTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import { createHash, randomBytes } from "crypto";
import { EmailClient } from "@azure/communication-email";
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

async function sendWelcomeEmail(name: string, email: string) {
  const connStr = process.env.ACS_CONNECTION_STRING;
  if (!connStr) return; // silently skip if not configured
  try {
    const client = new EmailClient(connStr);
    const poller = await client.beginSend({
      senderAddress: "DoNotReply@a386371c-ce60-494f-b8ab-bd686c6f096e.azurecomm.net",
      content: {
        subject: "🍽️ ¡Bienvenido/a a Los Menús de Elena!",
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h1 style="color:#16a34a;margin-bottom:8px">🍽️ ¡Bienvenido/a, ${name}!</h1>
            <p style="font-size:16px;color:#374151">Tu cuenta ha sido creada correctamente.</p>
            <p style="font-size:16px;color:#374151">Ya puedes empezar a planificar tus menús semanales con ayuda de la IA.</p>
            <div style="margin:24px 0;padding:16px;background:#f0fdf4;border-radius:12px">
              <p style="margin:0;font-size:14px;color:#166534"><strong>¿Qué puedes hacer?</strong></p>
              <ul style="margin:8px 0 0;padding-left:20px;color:#166534;font-size:14px">
                <li>Generar menús semanales automáticamente</li>
                <li>Pedir sugerencias al agente de IA</li>
                <li>Crear tu lista de la compra</li>
                <li>Enviar todo a tu email</li>
              </ul>
            </div>
            <p style="color:#6b7280;font-size:12px">Enviado desde Menu Planner</p>
          </div>
        `,
      },
      recipients: { to: [{ address: email }] },
    });
    await poller.pollUntilDone();
  } catch (err) {
    console.error("Welcome email error:", err);
  }
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
    // Send welcome email (non-blocking, non-fatal)
    if (email?.trim()) {
      sendWelcomeEmail(name.trim(), email.trim());
    }
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

// ── Forgot password: send reset email ──
const SENDER_ADDRESS = "DoNotReply@a386371c-ce60-494f-b8ab-bd686c6f096e.azurecomm.net";

async function sendResetEmail(email: string, name: string, token: string) {
  const connStr = process.env.ACS_CONNECTION_STRING;
  if (!connStr) {
    console.warn("ACS_CONNECTION_STRING not set — cannot send reset email");
    return;
  }
  const baseUrl = process.env.APP_URL || "https://micocina.azurewebsites.net";
  const resetLink = `${baseUrl}?reset=${token}`;
  try {
    const client = new EmailClient(connStr);
    const poller = await client.beginSend({
      senderAddress: SENDER_ADDRESS,
      content: {
        subject: "🔑 Restablecer contraseña — Los Menús de Elena",
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
            <h1 style="color:#E8602C;margin-bottom:8px">🔑 Restablecer contraseña</h1>
            <p style="font-size:16px;color:#374151">Hola, <strong>${name}</strong>.</p>
            <p style="font-size:16px;color:#374151">Hemos recibido una solicitud para restablecer tu contraseña.</p>
            <div style="margin:24px 0;text-align:center">
              <a href="${resetLink}" style="display:inline-block;padding:14px 32px;background:#E8602C;color:white;text-decoration:none;border-radius:12px;font-weight:bold;font-size:16px">
                Cambiar contraseña
              </a>
            </div>
            <p style="font-size:14px;color:#6b7280">O copia este enlace en tu navegador:</p>
            <p style="font-size:13px;color:#9ca3af;word-break:break-all">${resetLink}</p>
            <p style="font-size:13px;color:#6b7280;margin-top:24px">Este enlace caduca en 1 hora. Si no solicitaste este cambio, ignora este email.</p>
            <p style="color:#9ca3af;font-size:12px;margin-top:24px">Enviado desde Menu Planner</p>
          </div>
        `,
      },
      recipients: { to: [{ address: email }] },
    });
    await poller.pollUntilDone();
  } catch (err) {
    console.error("Reset email error:", err);
  }
}

router.post("/users/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      res.status(400).json({ error: "Email es obligatorio" });
      return;
    }
    // Find user by email (always respond 200 to avoid user enumeration)
    const users = await db.select().from(usersTable);
    const user = users.find(u => u.email?.toLowerCase() === email.trim().toLowerCase());
    if (user && user.email) {
      // Generate a secure random token
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await db.insert(passwordResetTokensTable).values({
        userId: user.id,
        token,
        expiresAt,
      });
      sendResetEmail(user.email, user.name, token);
    }
    // Always return success to prevent user enumeration
    res.json({ ok: true, message: "Si el email existe, recibirás un enlace para restablecer tu contraseña." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ error: "Error al procesar la solicitud" });
  }
});

router.post("/users/reset-password", async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || typeof token !== "string") {
      res.status(400).json({ error: "Token inválido" });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "La contraseña debe tener al menos 4 caracteres" });
      return;
    }
    // Find valid, unused, non-expired token
    const [resetRecord] = await db
      .select()
      .from(passwordResetTokensTable)
      .where(
        and(
          eq(passwordResetTokensTable.token, token),
          gt(passwordResetTokensTable.expiresAt, new Date()),
          isNull(passwordResetTokensTable.usedAt),
        )
      );
    if (!resetRecord) {
      res.status(400).json({ error: "El enlace ha expirado o ya fue utilizado. Solicita uno nuevo." });
      return;
    }
    // Update password
    await db
      .update(usersTable)
      .set({ passwordHash: hashPassword(password) })
      .where(eq(usersTable.id, resetRecord.userId));
    // Mark token as used
    await db
      .update(passwordResetTokensTable)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokensTable.id, resetRecord.id));
    res.json({ ok: true, message: "Contraseña actualizada correctamente." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ error: "Error al restablecer la contraseña" });
  }
});

export default router;
