import { Router, type IRouter } from "express";
import { Resend } from "resend";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  return new Resend(key);
}

const FROM_EMAIL = "Menu Planner <onboarding@resend.dev>";

// Send menu by email
router.post("/email/menu", async (req: AuthenticatedRequest, res) => {
  try {
    const { days, subject } = req.body as {
      days: { day: string; lunch: any; dinner: any }[];
      subject?: string;
    };
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user[0]?.email) {
      res.status(400).json({ error: "No tienes email configurado en tu perfil" });
      return;
    }

    const menuHtml = days.map(d => {
      const lp = d.lunch?.primero?.name ?? "—";
      const ls = d.lunch?.segundo?.name ?? "—";
      const dp = d.dinner?.primero?.name ?? "—";
      const ds = d.dinner?.segundo?.name ?? "—";
      return `<tr>
        <td style="padding:8px;border:1px solid #ddd;font-weight:bold">${d.day}</td>
        <td style="padding:8px;border:1px solid #ddd">${lp} + ${ls}</td>
        <td style="padding:8px;border:1px solid #ddd">${dp !== "—" ? dp + " + " : ""}${ds}</td>
      </tr>`;
    }).join("");

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">🍽️ Tu Menú Semanal</h2>
        <table style="width:100%;border-collapse:collapse;margin:16px 0">
          <thead>
            <tr style="background:#f3f4f6">
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Día</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Comida</th>
              <th style="padding:8px;border:1px solid #ddd;text-align:left">Cena</th>
            </tr>
          </thead>
          <tbody>${menuHtml}</tbody>
        </table>
        <p style="color:#6b7280;font-size:12px">Enviado desde Menu Planner</p>
      </div>
    `;

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: user[0].email,
      subject: subject ?? "🍽️ Tu Menú Semanal",
      html,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Error al enviar email: " + String(err) });
  }
});

// Send shopping list by email
router.post("/email/shopping", async (req: AuthenticatedRequest, res) => {
  try {
    const { items, extraItems } = req.body as {
      items: { ingredient: string; recipes: string[] }[];
      extraItems?: string[];
    };
    const user = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
    if (!user[0]?.email) {
      res.status(400).json({ error: "No tienes email configurado en tu perfil" });
      return;
    }

    const itemsHtml = items.map(i =>
      `<li style="padding:4px 0">
        <strong>${i.ingredient}</strong>
        <span style="color:#6b7280;font-size:12px"> (${i.recipes.join(", ")})</span>
      </li>`
    ).join("");

    const extrasHtml = extraItems?.length
      ? `<h3 style="margin-top:16px">Añadidos a mano</h3><ul>${extraItems.map(e => `<li>${e}</li>`).join("")}</ul>`
      : "";

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">🛒 Lista de la Compra</h2>
        <ul style="line-height:1.8">${itemsHtml}</ul>
        ${extrasHtml}
        <p style="color:#6b7280;font-size:12px;margin-top:24px">Enviado desde Menu Planner</p>
      </div>
    `;

    await getResend().emails.send({
      from: FROM_EMAIL,
      to: user[0].email,
      subject: "🛒 Lista de la Compra",
      html,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Error al enviar email: " + String(err) });
  }
});

export default router;
