import { jsPDF } from "jspdf";
import { getRecipeImageUrl, slugifyRecipe } from "./recipe-images";

interface RecipeForPdf {
  name: string;
  category: string;
  ingredients: string[];
  instructions?: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  primero: "Primero",
  segundo: "Segundo",
  otro: "Otro",
};

// Brand-ish palette (RGB)
const COLORS = {
  primary: [234, 88, 12] as [number, number, number], // orange-600
  dark: [31, 41, 55] as [number, number, number], // gray-800
  muted: [107, 114, 128] as [number, number, number], // gray-500
  line: [229, 231, 235] as [number, number, number], // gray-200
};

function slugify(text: string): string {
  return slugifyRecipe(text);
}

/** Loads an image URL and returns its data URL + natural dimensions. */
async function loadImageData(
  url: string,
): Promise<{ dataUrl: string; width: number; height: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { dataUrl, ...dims };
  } catch {
    return null;
  }
}

/**
 * Generates and downloads a clean, uniform PDF for a single recipe with its
 * name, category, dish photo (when available), ingredients and step-by-step
 * instructions.
 */
export async function downloadRecipePdf(recipe: RecipeForPdf): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 56;
  const contentWidth = pageWidth - marginX * 2;
  const bottomLimit = pageHeight - 56;
  let y = 64;

  const ensureSpace = (needed: number) => {
    if (y + needed > bottomLimit) {
      doc.addPage();
      y = 64;
    }
  };

  // ── Header band ──
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 6, "F");

  // Category pill
  const catLabel = CATEGORY_LABEL[recipe.category] ?? recipe.category;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...COLORS.primary);
  doc.text(catLabel.toUpperCase(), marginX, y);
  y += 18;

  // Title
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(...COLORS.dark);
  const titleLines = doc.splitTextToSize(recipe.name, contentWidth);
  doc.text(titleLines, marginX, y);
  y += titleLines.length * 26 + 6;

  // ── Dish photo (if available) ──
  const imageUrl = getRecipeImageUrl(recipe.name);
  if (imageUrl) {
    const img = await loadImageData(imageUrl);
    if (img) {
      const maxW = contentWidth;
      const maxH = 240;
      let w = maxW;
      let h = (img.height / img.width) * w;
      if (h > maxH) {
        h = maxH;
        w = (img.width / img.height) * h;
      }
      const x = marginX + (contentWidth - w) / 2;
      ensureSpace(h + 12);
      doc.addImage(img.dataUrl, "JPEG", x, y, w, h, undefined, "FAST");
      y += h + 14;
    }
  }

  // Divider
  doc.setDrawColor(...COLORS.line);
  doc.setLineWidth(1);
  ensureSpace(20);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 26;

  // ── Ingredients ──
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...COLORS.primary);
  doc.text("Ingredientes", marginX, y);
  y += 18;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...COLORS.dark);

  if (recipe.ingredients.length === 0) {
    doc.setTextColor(...COLORS.muted);
    doc.text("Sin ingredientes", marginX, y);
    y += 16;
  } else {
    for (const ing of recipe.ingredients) {
      const lines = doc.splitTextToSize(ing, contentWidth - 16);
      ensureSpace(lines.length * 15 + 2);
      // bullet
      doc.setFillColor(...COLORS.primary);
      doc.circle(marginX + 2, y - 4, 1.6, "F");
      doc.setTextColor(...COLORS.dark);
      doc.text(lines, marginX + 14, y);
      y += lines.length * 15 + 2;
    }
  }

  y += 16;

  // ── Instructions ──
  const instructions = (recipe.instructions ?? "").trim();
  if (instructions) {
    ensureSpace(40);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...COLORS.primary);
    doc.text("Preparación", marginX, y);
    y += 18;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(...COLORS.dark);

    const paragraphs = instructions.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    for (const para of paragraphs) {
      const lines = doc.splitTextToSize(para, contentWidth);
      ensureSpace(lines.length * 15 + 6);
      doc.text(lines, marginX, y);
      y += lines.length * 15 + 6;
    }
  }

  // ── Footer ──
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...COLORS.muted);
    doc.text("Mi Cocina · Planificador de menús", marginX, pageHeight - 32);
  }

  doc.save(`receta-${slugify(recipe.name)}.pdf`);
}
