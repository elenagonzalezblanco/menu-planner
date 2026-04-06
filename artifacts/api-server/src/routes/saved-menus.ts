import { Router, type IRouter } from "express";
import { db, savedMenusTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

// List saved menus
router.get("/saved-menus", async (req: AuthenticatedRequest, res) => {
  try {
    const menus = await db
      .select()
      .from(savedMenusTable)
      .where(eq(savedMenusTable.userId, req.user!.id))
      .orderBy(desc(savedMenusTable.savedAt));
    res.json(menus);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Save a menu
router.post("/saved-menus", async (req: AuthenticatedRequest, res) => {
  try {
    const { label, days } = req.body as { label: string; days: any[] };
    if (!label?.trim() || !days?.length) {
      res.status(400).json({ error: "label and days required" });
      return;
    }
    const [saved] = await db
      .insert(savedMenusTable)
      .values({ userId: req.user!.id, label: label.trim(), days })
      .returning();
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Delete a saved menu
router.delete("/saved-menus/:id", async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [deleted] = await db
      .delete(savedMenusTable)
      .where(and(eq(savedMenusTable.id, id), eq(savedMenusTable.userId, req.user!.id)))
      .returning();
    if (!deleted) { res.status(404).json({ error: "Saved menu not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Generate PDF for a saved menu
router.get("/saved-menus/:id/pdf", async (req: AuthenticatedRequest, res) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [menu] = await db
      .select()
      .from(savedMenusTable)
      .where(and(eq(savedMenusTable.id, id), eq(savedMenusTable.userId, req.user!.id)));
    if (!menu) { res.status(404).json({ error: "Saved menu not found" }); return; }

    const pdf = generateMenuPdf(menu.label, menu.days as any[], menu.savedAt);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="menu-${menu.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Error generating PDF" });
  }
});

// Also allow PDF for current active menu
router.get("/menus/:id/pdf", async (req: AuthenticatedRequest, res) => {
  try {
    const { weeklyMenusTable } = await import("@workspace/db");
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [menu] = await db
      .select()
      .from(weeklyMenusTable)
      .where(and(eq(weeklyMenusTable.id, id), eq(weeklyMenusTable.userId, req.user!.id)));
    if (!menu) { res.status(404).json({ error: "Menu not found" }); return; }

    const label = `Menú Semanal`;
    const pdf = generateMenuPdf(label, menu.days as any[], menu.createdAt);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="menu-${menu.id}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.status(500).json({ error: "Error generating PDF" });
  }
});

// ── Minimal PDF generator (no external deps) ──

function generateMenuPdf(
  title: string,
  days: { day: string; lunch: any; dinner: any }[],
  date: Date | string,
): Buffer {
  const dateStr = new Date(date).toLocaleDateString("es-ES", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  // Build table rows
  const rows = days.map((d) => {
    const lp = d.lunch?.primero?.name ?? "—";
    const ls = d.lunch?.segundo?.name ?? "—";
    const dp = d.dinner?.primero?.name ?? "—";
    const ds = d.dinner?.segundo?.name ?? "—";
    const lunchText = lp !== "—" ? `${lp} + ${ls}` : ls;
    const dinnerText = dp !== "—" ? `${dp} + ${ds}` : ds;
    return { day: d.day, lunch: lunchText, dinner: dinnerText };
  });

  // We generate a simple PDF manually (PDF 1.4 spec, no deps)
  const objects: string[] = [];
  let objCount = 0;

  function addObj(content: string): number {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj`);
    return objCount;
  }

  // Catalog
  addObj("<< /Type /Catalog /Pages 2 0 R >>"); // obj 1
  // Pages
  addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); // obj 2

  // Build page content stream
  const lines: string[] = [];
  const pageW = 595; // A4
  const margin = 50;
  let y = 780;

  // Title
  lines.push("BT");
  lines.push(`/F1 18 Tf`);
  lines.push(`${margin} ${y} Td`);
  lines.push(`(${pdfEscape(title)}) Tj`);
  lines.push("ET");
  y -= 22;

  // Date
  lines.push("BT");
  lines.push(`/F1 10 Tf`);
  lines.push(`${margin} ${y} Td`);
  lines.push(`(${pdfEscape(dateStr)}) Tj`);
  lines.push("ET");
  y -= 30;

  // Table header
  const colDay = margin;
  const colLunch = 150;
  const colDinner = 370;

  // Header line
  lines.push(`${margin} ${y + 2} m ${pageW - margin} ${y + 2} l S`);
  lines.push("BT");
  lines.push(`/F1 11 Tf`);
  lines.push(`${colDay} ${y - 12} Td (Dia) Tj`);
  lines.push("ET");
  lines.push("BT");
  lines.push(`/F1 11 Tf`);
  lines.push(`${colLunch} ${y - 12} Td (Comida) Tj`);
  lines.push("ET");
  lines.push("BT");
  lines.push(`/F1 11 Tf`);
  lines.push(`${colDinner} ${y - 12} Td (Cena) Tj`);
  lines.push("ET");
  y -= 16;
  lines.push(`${margin} ${y} m ${pageW - margin} ${y} l S`);
  y -= 6;

  // Data rows
  for (const row of rows) {
    y -= 18;
    if (y < 60) break; // page overflow safety

    lines.push("BT");
    lines.push(`/F1 10 Tf`);
    lines.push(`${colDay} ${y} Td (${pdfEscape(row.day)}) Tj`);
    lines.push("ET");

    lines.push("BT");
    lines.push(`/F1 10 Tf`);
    lines.push(`${colLunch} ${y} Td (${pdfEscape(truncate(row.lunch, 35))}) Tj`);
    lines.push("ET");

    lines.push("BT");
    lines.push(`/F1 10 Tf`);
    lines.push(`${colDinner} ${y} Td (${pdfEscape(truncate(row.dinner, 35))}) Tj`);
    lines.push("ET");

    y -= 4;
    lines.push(`0.85 0.85 0.85 RG`);
    lines.push(`${margin} ${y} m ${pageW - margin} ${y} l S`);
    lines.push(`0 0 0 RG`);
  }

  // Footer
  y -= 30;
  lines.push("BT");
  lines.push(`/F1 8 Tf`);
  lines.push(`0.5 0.5 0.5 rg`);
  lines.push(`${margin} ${Math.max(y, 30)} Td (Menu Planner - generado automaticamente) Tj`);
  lines.push(`0 0 0 rg`);
  lines.push("ET");

  const streamContent = lines.join("\n");
  const streamObj = addObj(
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
  ); // obj 3 = stream (but we need page first)

  // Actually, let me reorder: page=3, stream=4
  // Reset and redo
  objects.length = 0;
  objCount = 0;

  addObj("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); // 2

  const streamId = objCount + 2; // will be 4
  addObj(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} 842] ` +
    `/Contents ${streamId} 0 R ` +
    `/Resources << /Font << /F1 ${streamId + 1} 0 R >> >> >>`
  ); // 3 = page

  addObj(
    `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
  ); // 4 = stream

  addObj(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`
  ); // 5 = font

  // Build PDF file
  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  let body = "";
  for (const obj of objects) {
    offsets.push(header.length + body.length);
    body += obj + "\n";
  }

  const xrefOffset = header.length + body.length;
  let xref = `xref\n0 ${objCount + 1}\n`;
  xref += `0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }

  const trailer =
    `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(header + body + xref + trailer, "latin1");
}

function pdfEscape(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Replace non-latin1 chars with closest ASCII
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I")
    .replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/—/g, "-").replace(/–/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…".replace(/…/g, "...") : s;
}

export default router;
