import { Router, type IRouter } from "express";
import { db, mercadonaSettingsTable } from "@workspace/db";
import { chromium as playwrightChromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { execSync } from "child_process";

playwrightChromium.use(StealthPlugin());

const MERC_API = "https://api.mercadona.es/api";
const MERC_BROWSER_HEADERS: Record<string, string> = {
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "es-ES,es;q=0.9",
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Origin: "https://tienda.mercadona.es",
  Referer: "https://tienda.mercadona.es/",
};

/**
 * Try to use a session token directly against Mercadona's API.
 * Returns warehouse id and order id if token is valid.
 */
async function verifySessionToken(token: string): Promise<{ warehouseId: number; orderId: string | null } | null> {
  try {
    const res = await fetch(`${MERC_API}/orders/`, {
      headers: {
        ...MERC_BROWSER_HEADERS,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const orders = Array.isArray(data) ? data : data?.results ?? [];
    const activeOrder = orders.find((o: any) => o.state === "A" || o.status === "A" || o.state === "ACTIVE");
    return { warehouseId: 55, orderId: activeOrder?.id?.toString() ?? null };
  } catch {
    return null;
  }
}

/**
 * Search for a product via Mercadona API with auth token.
 */
async function searchProduct(query: string, token: string): Promise<{ id: string; display_name: string } | null> {
  try {
    const res = await fetch(
      `${MERC_API}/products/?q=${encodeURIComponent(query)}&section=all&lang=es&limit=5`,
      { headers: { ...MERC_BROWSER_HEADERS, Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const products = data.results ?? data.items ?? data.products ?? [];
    return products[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Add product to active order (cart).
 */
async function addToCart(productId: string, orderId: string, token: string): Promise<boolean> {
  try {
    for (const endpoint of [
      `${MERC_API}/orders/${orderId}/lines/`,
      `${MERC_API}/orders/${orderId}/items/`,
    ]) {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { ...MERC_BROWSER_HEADERS, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ product_id: productId, quantity: 1 }),
      });
      if (res.ok) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Clean ingredient name for better search results.
 */
function cleanIngredientForSearch(raw: string): string {
  let name = raw.trim();
  name = name.replace(/^\d+[\.,]?\d*\s*(gr?|kg|ml|l|tz|cdas?|tazas?)?\s*(de\s)?/i, "");
  name = name.replace(/^[\d\/]+\s+/i, "");
  name = name.replace(/\(.*?\)/g, "").trim();
  const qualifiers = [
    "abierta sin espinas", "sin espinas", "sin piel", "abierto", "abierta",
    "para el caldo", "para el guiso", "para guisar",
    "a la", "al gusto", "al punto",
    "picado", "picada", "troceado", "troceada",
    "fresco", "fresca", "frescos", "frescas",
    "grande", "mediano", "pequeño",
    "en rodajas", "en dados", "en tiras",
    "cruda", "crudo",
  ];
  for (const q of qualifiers) {
    name = name.replace(new RegExp(`\\s+${q}\\b`, "gi"), "");
  }
  name = name.replace(/^\d+\s+\w+\s+de\s+/i, "");
  name = name.trim().replace(/\s+/g, " ");
  name = name.replace(/^\d+\s*/, "").trim();
  return name || raw.trim();
}

function findChromiumPath(): string {
  try {
    return execSync("which chromium 2>/dev/null || which chromium-browser 2>/dev/null || echo ''", { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

/**
 * Playwright approach: if session token is provided, inject it into the browser
 * context and use Mercadona's web UI to add products to cart.
 * This is needed when direct API calls fail (e.g., IP restrictions).
 */
async function playwrightWithToken(
  sessionToken: string,
  postalCode: string,
  ingredients: string[]
): Promise<{ added: number; results: { ingredient: string; product: string | null; added: boolean; error?: string }[] }> {
  const chromiumPath = findChromiumPath();
  let browser: any;

  try {
    browser = await (playwrightChromium as any).launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--no-zygote", "--disable-blink-features=AutomationControlled",
        "--window-size=1280,800",
      ],
    });

    const context = await browser.newContext({
      userAgent: MERC_BROWSER_HEADERS["User-Agent"],
      viewport: { width: 1280, height: 800 },
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
    });

    // Inject auth token into localStorage before page loads
    await context.addInitScript((token: string) => {
      try {
        // Try multiple localStorage key patterns that Mercadona might use
        const keys = ["id", "token", "access_token", "auth_token", "mercadona_token"];
        for (const key of keys) {
          localStorage.setItem(key, token);
        }
        // Also set as a cookie just in case
        document.cookie = `auth_token=${token}; domain=.tienda.mercadona.es; path=/`;
      } catch { /* ignore */ }
    }, sessionToken);

    const page = await context.newPage();

    // Capture any auth-related responses to validate the session
    let capturedToken: string | null = null;
    page.on("response", async (response: any) => {
      const url: string = response.url();
      if (!url.includes("mercadona")) return;
      try {
        const body = await response.json().catch(() => null);
        if (!body) return;
        const t = body.token ?? body.access_token ?? body.access;
        if (t && typeof t === "string" && t.length > 20) {
          capturedToken = t;
          console.log("✓ Captured fresh token from:", url);
        }
      } catch { /* ignore */ }
    });

    // Navigate to Mercadona, which should pick up the injected token
    await page.goto("https://tienda.mercadona.es", { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(3000);

    // Accept cookies if shown
    try {
      const btns = await page.$$("button");
      for (const btn of btns) {
        const text = await btn.innerText().catch(() => "");
        if (text.includes("Aceptar") || text.includes("Acepto")) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch { /* no cookies popup */ }

    // Enter postal code
    try {
      const postalInput = await page.waitForSelector('input[name="postalCode"]', { timeout: 6000 });
      await postalInput!.fill(postalCode);
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    } catch { /* no postal input */ }

    const results: { ingredient: string; product: string | null; added: boolean; error?: string }[] = [];
    let addedCount = 0;

    const effectiveToken = capturedToken ?? sessionToken;

    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i];
      const searchTerm = cleanIngredientForSearch(ingredient);
      console.log(`[${i + 1}/${ingredients.length}] ${ingredient}${searchTerm !== ingredient ? ` → "${searchTerm}"` : ""}`);

      try {
        await page.goto(
          `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(searchTerm)}`,
          { waitUntil: "domcontentloaded", timeout: 20000 }
        );
        await page.waitForTimeout(800 + Math.random() * 500);

        const productName = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll("button"));
          const productBtn = btns.find(b => {
            const t = (b as HTMLElement).innerText;
            return t && t.length > 10 && t.includes("€");
          });
          if (!productBtn) return null;
          const lines = (productBtn as HTMLElement).innerText.split("\n").filter((l: string) => l.trim().length > 0);
          return lines[0]?.trim() ?? null;
        });

        const added = await page.evaluate(() => {
          const allBtns = Array.from(document.querySelectorAll("button"));
          const addBtn = allBtns.find(b => {
            const t = (b as HTMLElement).innerText.trim();
            return t === "Añadir al carro" || t === "Añadir" || t.includes("Añadir al carro");
          });
          if (addBtn) { (addBtn as HTMLButtonElement).click(); return true; }
          return false;
        });

        if (added) {
          await page.waitForTimeout(400);
          addedCount++;
          results.push({ ingredient, product: productName, added: true });
          console.log(`  ✓ Added: ${productName ?? ingredient}`);
        } else {
          results.push({ ingredient, product: null, added: false, error: "Producto no disponible o no encontrado" });
          console.log(`  ✗ Not found: ${searchTerm}`);
        }
      } catch (err: any) {
        results.push({ ingredient, product: null, added: false, error: "Error al buscar" });
        console.log(`  ✗ Error: ${err.message?.split("\n")[0]}`);
      }
    }

    // Check if we're logged in after all operations
    const finalUrl = page.url();
    const loggedIn = await page.evaluate(() => {
      return document.querySelector('[class*="account-menu__user"]') !== null ||
        document.querySelector('[class*="user-name"]') !== null ||
        !document.querySelector('button:has-text("Identifícate")');
    }).catch(() => false);

    console.log(`Playwright session: loggedIn=${loggedIn}, finalUrl=${finalUrl}`);
    await browser.close();

    return { added: addedCount, results };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }
}

/**
 * Standard Playwright fallback: browser login (may fail due to reCAPTCHA).
 * Used when no session token is available.
 */
async function playwrightBrowserLogin(
  email: string,
  password: string,
  postalCode: string,
  ingredients: string[]
): Promise<{
  loggedIn: boolean;
  loginError?: string;
  results: { ingredient: string; product: string | null; added: boolean; error?: string }[];
}> {
  const chromiumPath = findChromiumPath();
  let browser: any;
  let capturedToken: string | null = null;

  try {
    browser = await (playwrightChromium as any).launch({
      headless: true,
      executablePath: chromiumPath || undefined,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage",
        "--disable-gpu", "--no-zygote", "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process", "--window-size=1280,800",
      ],
    });

    const context = await browser.newContext({
      userAgent: MERC_BROWSER_HEADERS["User-Agent"],
      viewport: { width: 1280, height: 800 },
      locale: "es-ES",
      timezoneId: "Europe/Madrid",
      extraHTTPHeaders: { "Accept-Language": "es-ES,es;q=0.9" },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      (window as any).chrome = { runtime: {} };
    });

    const page = await context.newPage();

    page.on("response", async (response: any) => {
      const url: string = response.url();
      if (!url.includes("mercadona")) return;
      try {
        const body = await response.json().catch(() => null);
        if (!body) return;
        const t = body.token ?? body.access_token ?? body.access;
        if (t && typeof t === "string" && t.length > 20) {
          capturedToken = t;
          console.log("✓ Captured token from:", url);
        }
      } catch { /* ignore */ }
    });

    await page.goto("https://tienda.mercadona.es", { waitUntil: "load", timeout: 60000 });
    await page.waitForTimeout(2500 + Math.random() * 1500);

    // Accept cookies
    try {
      const btns = await page.$$("button");
      for (const btn of btns) {
        const text = await btn.innerText().catch(() => "");
        if (text.includes("Aceptar") || text.includes("Acepto")) {
          await btn.click();
          await page.waitForTimeout(1000);
          break;
        }
      }
    } catch { /* ignore */ }

    // Postal code
    try {
      const postalInput = await page.waitForSelector('input[name="postalCode"]', { timeout: 6000 });
      await postalInput!.fill(postalCode);
      await page.waitForTimeout(500);
      await page.keyboard.press("Enter");
      await page.waitForTimeout(3000);
    } catch { /* ignore */ }

    let loggedIn = false;
    let loginError = "";

    try {
      await page.mouse.move(200 + Math.random() * 100, 200 + Math.random() * 100);
      await page.waitForTimeout(500);
      await page.click('button:has-text("Identifícate")', { timeout: 8000 });
      await page.waitForTimeout(1000 + Math.random() * 500);
      await page.click(".account-menu__sign-in", { timeout: 5000 });
      await page.waitForTimeout(2000);

      const emailInput = await page.waitForSelector('input[name="email"]', { timeout: 8000 });
      await emailInput!.click();
      await page.waitForTimeout(400 + Math.random() * 200);
      await page.keyboard.type(email, { delay: 60 + Math.random() * 40 });
      await page.waitForTimeout(800);

      const continuarBtn = await page.$('button:has-text("Continuar")');
      if (continuarBtn) {
        const bb = await continuarBtn.boundingBox();
        if (bb) await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
        await continuarBtn.click();
      } else {
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(3000);

      const passInput = await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
      await passInput!.click();
      await page.waitForTimeout(500);
      await page.keyboard.type(password, { delay: 60 + Math.random() * 40 });
      await page.waitForTimeout(800);

      const entrarBtn = await page.waitForSelector('button:has-text("Entrar")', { timeout: 5000 });
      const bb = await entrarBtn!.boundingBox();
      if (bb) await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2, { steps: 10 });
      await page.waitForTimeout(300);
      await entrarBtn!.click();
      await page.waitForTimeout(15000);

      loggedIn = !page.url().includes("authenticate-user");
      if (!loggedIn) {
        const errorEl = await page.evaluate(() => {
          const el = document.querySelector(".error-message, [class*='error']");
          return el ? (el as HTMLElement).innerText : null;
        });
        loginError = errorEl || "Login bloqueado por protección anti-bots de Mercadona";
      } else {
        console.log("✓ Browser login SUCCESS");
      }
    } catch (err: any) {
      loginError = err.message?.split("\n")[0] ?? "Error en login";
    }

    const results: { ingredient: string; product: string | null; added: boolean; error?: string }[] = [];

    if (loggedIn || capturedToken) {
      for (let i = 0; i < ingredients.length; i++) {
        const ingredient = ingredients[i];
        const searchTerm = cleanIngredientForSearch(ingredient);
        console.log(`[${i + 1}/${ingredients.length}] ${ingredient}${searchTerm !== ingredient ? ` → "${searchTerm}"` : ""}`);
        try {
          await page.goto(
            `https://tienda.mercadona.es/search-results?query=${encodeURIComponent(searchTerm)}`,
            { waitUntil: "domcontentloaded", timeout: 20000 }
          );
          await page.waitForTimeout(600 + Math.random() * 400);

          const productName = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("button"));
            const productBtn = btns.find(b => {
              const t = (b as HTMLElement).innerText;
              return t && t.length > 10 && t.includes("€");
            });
            if (!productBtn) return null;
            const lines = (productBtn as HTMLElement).innerText.split("\n").filter((l: string) => l.trim().length > 0);
            return lines[0]?.trim() ?? null;
          });

          const added = await page.evaluate(() => {
            const allBtns = Array.from(document.querySelectorAll("button"));
            const addBtn = allBtns.find(b => {
              const t = (b as HTMLElement).innerText.trim();
              return t === "Añadir al carro" || t === "Añadir" || t.includes("Añadir al carro");
            });
            if (addBtn) { (addBtn as HTMLButtonElement).click(); return true; }
            return false;
          });

          if (added) await page.waitForTimeout(400);
          results.push({ ingredient, product: productName, added });
          console.log(`  ${added ? "✓" : "✗"} ${productName ?? ingredient}`);
        } catch {
          results.push({ ingredient, product: null, added: false, error: "Error al buscar" });
        }
      }
    } else {
      for (const ingredient of ingredients) {
        results.push({ ingredient, product: null, added: false, error: "Login requerido" });
      }
    }

    await browser.close();
    return { loggedIn: loggedIn || !!capturedToken, loginError, results };
  } catch (err) {
    if (browser) await browser.close().catch(() => {});
    throw err;
  }
}

const router: IRouter = Router();

router.get("/mercadona/credentials", async (_req, res) => {
  try {
    const [settings] = await db.select({
      email: mercadonaSettingsTable.email,
      postalCode: mercadonaSettingsTable.postalCode,
      id: mercadonaSettingsTable.id,
      hasSessionToken: mercadonaSettingsTable.sessionToken,
    }).from(mercadonaSettingsTable);

    if (!settings) return res.json({ saved: false });
    res.json({
      saved: true,
      email: settings.email,
      postalCode: settings.postalCode,
      hasSessionToken: !!settings.hasSessionToken,
    });
  } catch {
    res.status(500).json({ error: "Error checking credentials" });
  }
});

router.post("/mercadona/credentials", async (req, res) => {
  try {
    const { email, password, postalCode, sessionToken } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Email and password required" });

    await db.delete(mercadonaSettingsTable);
    await db.insert(mercadonaSettingsTable).values({
      email,
      password,
      postalCode: postalCode || "28001",
      sessionToken: sessionToken || null,
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error saving credentials" });
  }
});

router.delete("/mercadona/credentials", async (_req, res) => {
  try {
    await db.delete(mercadonaSettingsTable);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Error deleting credentials" });
  }
});

router.post("/mercadona/automate", async (req, res) => {
  const { ingredients } = req.body as { ingredients: string[] };
  if (!ingredients?.length) return res.status(400).json({ error: "No ingredients provided" });

  const [settings] = await db.select().from(mercadonaSettingsTable);
  if (!settings) return res.status(401).json({ error: "Configura primero tu cuenta de Mercadona." });

  try {
    console.log(`\n=== Mercadona automation: ${ingredients.length} ingredients ===`);

    // ── STRATEGY 1: Session token via direct API (fastest, most reliable) ──
    if (settings.sessionToken) {
      console.log("Trying session token via API...");
      const sessionValid = await verifySessionToken(settings.sessionToken);

      if (sessionValid) {
        console.log("✓ Session token valid — using direct API");
        const results: { ingredient: string; product: string | null; added: boolean; error?: string }[] = [];
        let addedCount = 0;

        for (let i = 0; i < ingredients.length; i++) {
          const ingredient = ingredients[i];
          const searchTerm = cleanIngredientForSearch(ingredient);
          console.log(`[${i + 1}/${ingredients.length}] ${ingredient}${searchTerm !== ingredient ? ` → "${searchTerm}"` : ""}`);

          try {
            const product = await searchProduct(searchTerm, settings.sessionToken!);
            if (product) {
              let added = false;
              if (sessionValid.orderId) {
                added = await addToCart(product.id, sessionValid.orderId, settings.sessionToken!);
              }
              results.push({ ingredient, product: product.display_name, added });
              if (added) addedCount++;
              console.log(`  ${added ? "✓" : "⚠"} ${product.display_name}${added ? "" : " (en cesta pero sin orden activa)"}`);
            } else {
              results.push({ ingredient, product: null, added: false, error: "No encontrado en Mercadona" });
              console.log(`  ✗ Not found: ${searchTerm}`);
            }
          } catch {
            results.push({ ingredient, product: null, added: false, error: "Error al buscar" });
          }
        }

        return res.json({
          success: true,
          loggedIn: true,
          method: "session-token-api",
          totalIngredients: ingredients.length,
          added: addedCount,
          notFound: results.filter(r => !r.added).length,
          results,
        });
      }

      // Token invalid but we have it — try Playwright with the token injected
      console.log("Session token invalid via API — trying Playwright with token injection...");
      const { added: addedCount, results } = await playwrightWithToken(
        settings.sessionToken,
        settings.postalCode,
        ingredients
      );

      return res.json({
        success: true,
        loggedIn: addedCount > 0,
        method: "session-token-playwright",
        totalIngredients: ingredients.length,
        added: addedCount,
        notFound: results.filter(r => !r.added).length,
        results,
      });
    }

    // ── STRATEGY 2: Browser login (may fail due to reCAPTCHA) ──
    console.log("No session token — trying browser login...");
    const result = await playwrightBrowserLogin(
      settings.email,
      settings.password,
      settings.postalCode,
      ingredients
    );

    const addedCount = result.results.filter(r => r.added).length;
    console.log(`=== Done (browser): ${addedCount}/${result.results.length} ===\n`);

    res.json({
      success: true,
      loggedIn: result.loggedIn,
      loginError: result.loggedIn ? undefined : result.loginError,
      method: "playwright-browser",
      totalIngredients: ingredients.length,
      added: addedCount,
      notFound: result.results.filter(r => !r.added).length,
      results: result.results,
    });
  } catch (err) {
    console.error("Mercadona automation error:", err);
    res.status(500).json({ error: "Automation failed: " + String(err) });
  }
});

export default router;
