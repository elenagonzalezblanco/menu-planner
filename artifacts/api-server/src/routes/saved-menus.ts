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

// ── Minimal PDF generator (no external deps) — table format matching print view ──

export function generateMenuPdf(
  title: string,
  days: { day: string; lunch: any; dinner: any }[],
  date: Date | string,
): Buffer {
  const dateStr = new Date(date).toLocaleDateString("es-ES", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });

  const pageW = 842; // A4 landscape
  const pageH = 595;
  const margin = 40;
  const tableW = pageW - 2 * margin;
  const labelColW = 70;
  const dayColW = (tableW - labelColW) / days.length;

  // Build content stream
  const lines: string[] = [];

  // Title
  lines.push("BT", `/F2 16 Tf`, `${margin} ${pageH - 40} Td`, `(${pe(title)}) Tj`, "ET");
  lines.push("BT", `/F1 9 Tf`, `0.4 0.4 0.4 rg`, `${margin} ${pageH - 55} Td`, `(${pe(dateStr)}) Tj`, `0 0 0 rg`, "ET");

  let y = pageH - 80;
  const rowH = 28;
  const headerH = 30;

  // ── Table header (days) ──
  // Empty label cell
  drawRect(lines, margin, y - headerH, labelColW, headerH, "0.96 0.96 0.96");
  drawBorder(lines, margin, y - headerH, labelColW, headerH);

  // Day headers (orange background)
  for (let i = 0; i < days.length; i++) {
    const x = margin + labelColW + i * dayColW;
    drawRect(lines, x, y - headerH, dayColW, headerH, "0.91 0.38 0.17"); // #E8602C
    drawBorder(lines, x, y - headerH, dayColW, headerH);
    drawText(lines, x + dayColW / 2, y - headerH + 10, days[i].day, 10, true, "1 1 1");
  }
  y -= headerH;

  // ── Data rows ──
  const rowDefs: { label: string; sublabel: string; bg: string; getValue: (d: any) => string }[] = [
    { label: "Comida", sublabel: "Primero", bg: "1 0.97 0.94", getValue: (d: any) => d.lunch?.primero?.name ?? "" },
  ];
  if (days.some((d: any) => d.lunch?.primero2)) {
    rowDefs.push({ label: "", sublabel: "Primero 2", bg: "1 0.97 0.94", getValue: (d: any) => d.lunch?.primero2?.name ?? "" });
  }
  rowDefs.push({ label: "", sublabel: "Segundo", bg: "1 0.97 0.94", getValue: (d: any) => d.lunch?.segundo?.name ?? "" });
  if (days.some((d: any) => d.lunch?.segundo2)) {
    rowDefs.push({ label: "", sublabel: "Segundo 2", bg: "1 0.97 0.94", getValue: (d: any) => d.lunch?.segundo2?.name ?? "" });
  }
  rowDefs.push({ label: "Cena", sublabel: "Primero", bg: "0.94 0.96 1", getValue: (d: any) => d.dinner?.primero?.name ?? "" });
  if (days.some((d: any) => d.dinner?.primero2)) {
    rowDefs.push({ label: "", sublabel: "Primero 2", bg: "0.94 0.96 1", getValue: (d: any) => d.dinner?.primero2?.name ?? "" });
  }
  rowDefs.push({ label: "", sublabel: "Segundo", bg: "0.94 0.96 1", getValue: (d: any) => d.dinner?.segundo?.name ?? "" });
  if (days.some((d: any) => d.dinner?.segundo2)) {
    rowDefs.push({ label: "", sublabel: "Segundo 2", bg: "0.94 0.96 1", getValue: (d: any) => d.dinner?.segundo2?.name ?? "" });
  }

  for (const row of rowDefs) {
    // Label cell
    drawRect(lines, margin, y - rowH, labelColW, rowH, "0.97 0.97 0.97");
    drawBorder(lines, margin, y - rowH, labelColW, rowH);
    if (row.label) {
      drawText(lines, margin + labelColW - 5, y - 10, row.label, 9, true, "0.4 0.26 0", "right");
    }
    drawText(lines, margin + labelColW - 5, y - rowH + 6, row.sublabel, 7, false, "0.5 0.5 0.5", "right");

    // Day cells
    for (let i = 0; i < days.length; i++) {
      const x = margin + labelColW + i * dayColW;
      const val = row.getValue(days[i]);
      drawRect(lines, x, y - rowH, dayColW, rowH, row.bg);
      drawBorder(lines, x, y - rowH, dayColW, rowH);
      if (val) {
        // Truncate long recipe names and split if needed
        const display = val.length > 20 ? val.slice(0, 19) + "..." : val;
        drawText(lines, x + dayColW / 2, y - rowH / 2 - 3, display, 8, false, "0.1 0.1 0.1");
      }
    }
    y -= rowH;
  }

  // Footer
  lines.push("BT", `/F1 7 Tf`, `0.6 0.6 0.6 rg`,
    `${margin} 25 Td`, `(Menu Planner - La Cocina - generado automaticamente) Tj`,
    `0 0 0 rg`, "ET");

  return buildPdf(lines, pageW, pageH);
}

function drawRect(lines: string[], x: number, y: number, w: number, h: number, rgbColor: string) {
  lines.push(`${rgbColor} rg`, `${x} ${y} ${w} ${h} re f`, `0 0 0 rg`);
}

function drawBorder(lines: string[], x: number, y: number, w: number, h: number) {
  lines.push(`0.82 0.82 0.82 RG`, `0.5 w`, `${x} ${y} ${w} ${h} re S`, `0 0 0 RG`, `1 w`);
}

function drawText(lines: string[], x: number, y: number, text: string, size: number, bold: boolean, color: string, align: string = "center") {
  const font = bold ? "/F2" : "/F1";
  // Approximate text width for centering (rough: 0.5 * size per char)
  const charW = size * 0.45;
  const textW = text.length * charW;
  let tx = x;
  if (align === "center") tx = x - textW / 2;
  else if (align === "right") tx = x - textW - 3;

  lines.push("BT", `${font} ${size} Tf`, `${color} rg`, `${tx} ${y} Td`, `(${pe(text)}) Tj`, `0 0 0 rg`, "ET");
}

function buildPdf(contentLines: string[], pageW: number, pageH: number): Buffer {
  const streamContent = contentLines.join("\n");
  const objects: string[] = [];
  let objCount = 0;

  function addObj(content: string): number {
    objCount++;
    objects.push(`${objCount} 0 obj\n${content}\nendobj`);
    return objCount;
  }

  addObj("<< /Type /Catalog /Pages 2 0 R >>"); // 1
  addObj("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"); // 2
  addObj(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
    `/Contents 4 0 R ` +
    `/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>`
  ); // 3
  addObj(`<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`); // 4
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`); // 5
  addObj(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`); // 6

  const header = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  let body = "";
  for (const obj of objects) {
    offsets.push(header.length + body.length);
    body += obj + "\n";
  }

  const xrefOffset = header.length + body.length;
  let xref = `xref\n0 ${objCount + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(header + body + xref + trailer, "latin1");
}

function pe(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/á/g, "a").replace(/é/g, "e").replace(/í/g, "i")
    .replace(/ó/g, "o").replace(/ú/g, "u").replace(/ñ/g, "n")
    .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I")
    .replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ñ/g, "N")
    .replace(/ü/g, "u").replace(/Ü/g, "U")
    .replace(/—/g, "-").replace(/–/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}

export default router;
