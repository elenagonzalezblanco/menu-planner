import { pathToFileURL } from "node:url";

export const FRONTEND_ORIGIN = "https://elenagonzalezblanco.github.io";

export async function checkPublicApi(apiUrl, fetchImpl = fetch) {
  if (!apiUrl) throw new Error("VITE_API_URL must be set before building GitHub Pages.");
  const base = new URL(apiUrl);
  if (base.protocol !== "https:" || base.username || base.password ||
      base.pathname !== "/" || base.search || base.hash) {
    throw new Error("VITE_API_URL must be an HTTPS origin without credentials, path, query or fragment.");
  }

  async function request(path, options = {}) {
    return fetchImpl(`${base.origin}${path}`, {
      ...options,
      headers: { Origin: FRONTEND_ORIGIN, ...options.headers },
      signal: AbortSignal.timeout(30_000),
      redirect: "error",
    });
  }

  function checkCors(response, label) {
    if (response.headers.get("access-control-allow-origin") !== FRONTEND_ORIGIN) {
      throw new Error(`${label}: API does not allow the GitHub Pages origin.`);
    }
  }

  const health = await request("/api/healthz");
  if (!health.ok) throw new Error(`API health check failed: HTTP ${health.status}.`);
  checkCors(health, "Health");
  const healthBody = await health.json();
  if (healthBody?.status !== "ok" || healthBody?.db !== true) {
    throw new Error("API health check did not confirm a healthy database.");
  }

  const preflight = await request("/api/users/login", {
    method: "OPTIONS",
    headers: {
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });
  if (!preflight.ok) throw new Error(`Login CORS preflight failed: HTTP ${preflight.status}.`);
  checkCors(preflight, "Login preflight");
  const methods = (preflight.headers.get("access-control-allow-methods") ?? "").split(",").map(value => value.trim().toUpperCase());
  const headers = (preflight.headers.get("access-control-allow-headers") ?? "").split(",").map(value => value.trim().toLowerCase());
  if (!methods.includes("POST") || !headers.includes("content-type")) {
    throw new Error("Login CORS preflight does not allow JSON POST requests.");
  }

  // Missing fields exercise the public login route without credentials or account changes.
  const login = await request("/api/users/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (login.status !== 400) {
    throw new Error(`Login must validate missing fields without requiring a session: HTTP ${login.status}.`);
  }
  checkCors(login, "Login");
  const loginBody = await login.json();
  if (loginBody?.error !== "Email and password are required") {
    throw new Error("Login response does not match the expected public API contract.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkPublicApi(process.env.VITE_API_URL);
    console.log("Public API health, database, login validation and CORS checks passed.");
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
