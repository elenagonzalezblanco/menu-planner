import { Router, type IRouter } from "express";
import { EmailClient } from "@azure/communication-email";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middlewares/auth";
import { generateMenuPdf } from "./saved-menus";

const router: IRouter = Router();

function getEmailClient() {
  const connStr = process.env.ACS_CONNECTION_STRING;
  if (!connStr) throw new Error("ACS_CONNECTION_STRING not configured");
  return new EmailClient(connStr);
}

const SENDER_ADDRESS = "DoNotReply@a386371c-ce60-494f-b8ab-bd686c6f096e.azurecomm.net";

async function sendEmail(to: string, subject: string, html: string, attachments?: { name: string; contentType: string; contentInBase64: string }[]) {
  const client = getEmailClient();
  const message: any = {
    senderAddress: SENDER_ADDRESS,
    content: { subject, html },
    recipients: { to: [{ address: to }] },
  };
  if (attachments?.length) {
    message.attachments = attachments;
  }
  const poller = await client.beginSend(message);
  const result = await poller.pollUntilDone();
  console.log("ACS email result:", JSON.stringify({ id: result.id, status: result.status, to, subject }));
  if (result.status !== "Succeeded") {
    throw new Error(`ACS email status: ${result.status} (${result.id})`);
  }
  return result;
}

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

    const dayHeaders = days.map(d =>
      `<th style="padding:8px 6px;border:1px solid #ddd;background:#E8602C;color:white;font-size:13px;font-weight:bold;text-align:center">${d.day}</th>`
    ).join("");

    function mealRow(label: string, sublabel: string, bg: string, getValue: (d: any) => string) {
      const cells = days.map(d => {
        const val = getValue(d);
        return `<td style="padding:7px 6px;border:1px solid #ddd;background:${bg};font-size:12px;text-align:center;color:${val ? '#1a1a1a' : '#ccc'}">${val || "—"}</td>`;
      }).join("");
      return `<tr>
        <td style="padding:6px;border:1px solid #ddd;background:#f9f9f9;font-size:11px;text-align:right;vertical-align:middle">
          ${label ? `<div style="font-weight:bold;color:#d35400">${label}</div>` : ""}
          <div style="color:#888;font-size:10px">${sublabel}</div>
        </td>${cells}</tr>`;
    }

    const html = `
      <div style="font-family:sans-serif;max-width:800px;margin:0 auto">
        <h2 style="color:#16a34a;margin-bottom:4px">🍽️ Tu Menú Semanal</h2>
        <p style="color:#666;font-size:13px;margin-top:0">${new Date().toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;table-layout:fixed">
          <thead>
            <tr>
              <th style="width:70px;border:1px solid #ddd;padding:8px;background:#f5f5f5">&nbsp;</th>
              ${dayHeaders}
            </tr>
          </thead>
          <tbody>
            ${mealRow("☀️ Comida", "Primero", "#fff8f0", d => d.lunch?.primero?.name)}
            ${mealRow("", "Segundo", "#fff8f0", d => d.lunch?.segundo?.name)}
            ${mealRow("🌙 Cena", "Primero", "#f0f4ff", d => d.dinner?.primero?.name)}
            ${mealRow("", "Segundo", "#f0f4ff", d => d.dinner?.segundo?.name)}
          </tbody>
        </table>
        <p style="color:#999;font-size:11px;text-align:center">La Cocina — Menu Planner</p>
      </div>
    `;

    await sendEmail(
      user[0].email,
      subject ?? "🍽️ Tu Menú Semanal",
      html,
      [{
        name: "menu-semanal.pdf",
        contentType: "application/pdf",
        contentInBase64: generateMenuPdf("Menu Semanal", days, new Date()).toString("base64"),
      }],
    );

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

    await sendEmail(user[0].email, "🛒 Lista de la Compra", html);

    res.json({ ok: true });
  } catch (err) {
    console.error("Email error:", err);
    res.status(500).json({ error: "Error al enviar email: " + String(err) });
  }
});

export default router;
