// Mi Cocina → Mercadona helper (runs in the background on Elena's Mac via launchd).
//
// Mercadona rejects requests coming from servers, so the app's «Rellena la cesta
// automática» button only queues a request. This helper claims it and opens
// Mercadona with its own logged-in browser profile to fill the cart, using the
// same connector as the bookmark. It never orders or pays.
//
//   node helper.mjs          keep polling (what launchd runs)
//   node helper.mjs --touch  open Mercadona once so it can refresh its session
import { chromium } from "playwright-core";
import { execFileSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PROFILE = path.join(HERE, "profile");
const POLL_MS = 15_000;
const OFFLINE_RETRY_MS = 5 * 60_000;
/** Opening Mercadona once a day lets it refresh the session before it expires. */
const TOUCH_MS = 24 * 60 * 60_000;
const FILL_TIMEOUT_MS = 8 * 60_000;

const config = JSON.parse(await readFile(path.join(HERE, "config.json"), "utf8"));
const API = String(config.api).replace(/\/+$/, "");

const log = message => console.log(`${new Date().toISOString()} ${message}`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function micocina(pathname, body) {
  const response = await fetch(`${API}/api/mercadona-connector${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 401) throw Object.assign(new Error("Mi Cocina rejected the connector token"), { auth: true });
  if (!response.ok) throw new Error(`Mi Cocina HTTP ${response.status}`);
  return response.json();
}

/** Mercadona's search rejects the "HeadlessEdg" user agent, so present the installed Edge as a normal one. */
function edgeUserAgent() {
  let major = "156";
  try {
    const version = execFileSync("plutil", ["-extract", "CFBundleShortVersionString", "raw",
      "/Applications/Microsoft Edge.app/Contents/Info.plist"], { encoding: "utf8" }).trim();
    major = version.split(".")[0] || major;
  } catch { /* keep the default */ }
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36 Edg/${major}.0.0.0`;
}

export async function openMercadona(options = {}) {
  await mkdir(PROFILE, { recursive: true });
  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: "msedge",
    headless: options.headless ?? config.headless !== false,
    userAgent: edgeUserAgent(),
    viewport: { width: 1280, height: 900 },
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://tienda.mercadona.es/", { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(5_000);
  return { context, page };
}

/** Mercadona briefly removes its session while refreshing the token. */
export async function mercadonaLoggedIn(page) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (await page.evaluate(() => !!localStorage.getItem("MO-user")).catch(() => false)) return true;
    await page.waitForTimeout(1_000);
  }
  return false;
}

async function fulfil(request) {
  log(`request ${request.id}: filling the Mercadona cart`);
  const { context, page } = await openMercadona();
  try {
    if (!await mercadonaLoggedIn(page)) {
      log(`request ${request.id}: Mercadona session expired`);
      await micocina(`/requests/${request.id}/finish`, {
        status: "error",
        message: "La sesión de Mercadona del Mac ha caducado. Pide a Scout que te abra la ventana para volver a entrar en Mercadona.",
      });
      return;
    }
    await page.evaluate(({ api, token }) => { window.__MICOCINA_CONFIG = { api, token, autorun: "false" }; }, { api: API, token: config.token });
    await page.addScriptTag({ url: `${API}/mercadona-connector.js?t=${Date.now()}` });
    await page.waitForFunction(() => typeof window.__micocinaConnector?.fulfil === "function", null, { timeout: 30_000 });
    // The connector fills the cart and reports the outcome to Mi Cocina itself.
    await Promise.race([
      page.evaluate(id => window.__micocinaConnector.fulfil({ id }), request.id),
      sleep(FILL_TIMEOUT_MS).then(() => { throw new Error("timed out"); }),
    ]);
    log(`request ${request.id}: done`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function touch() {
  const { context, page } = await openMercadona();
  try {
    const loggedIn = await mercadonaLoggedIn(page);
    await page.waitForTimeout(10_000);
    log(`daily Mercadona visit: ${loggedIn ? "session active" : "SESSION EXPIRED, login needed"}`);
  } finally {
    await context.close().catch(() => {});
  }
}

async function main() {
  if (process.argv.includes("--touch")) {
    await touch();
    return;
  }
  log("helper started");
  let lastTouch = 0;
  // While the Mac sleeps or is offline every poll fails: log the change, not every failure.
  let failing = false;
  for (;;) {
    let wait = POLL_MS;
    try {
      const { request } = await micocina("/requests/claim");
      if (failing) log("Mi Cocina reachable again");
      failing = false;
      if (request) {
        await fulfil(request).catch(async error => {
          log(`request ${request.id} failed: ${error.message}`);
          await micocina(`/requests/${request.id}/finish`, {
            status: "error",
            message: "No se pudo llenar el carro desde el Mac. Vuelve a pulsar el botón en unos minutos.",
          }).catch(() => {});
        });
      } else if (Date.now() - lastTouch > TOUCH_MS) {
        lastTouch = Date.now();
        await touch().catch(error => log(`daily Mercadona visit failed: ${error.message}`));
      }
    } catch (error) {
      if (!failing || error.auth) log(`poll failed: ${error.message}`);
      failing = true;
      if (error.auth) wait = OFFLINE_RETRY_MS;
    }
    await sleep(wait);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
