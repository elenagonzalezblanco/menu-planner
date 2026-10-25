/*
 * Mi Cocina → Mercadona connector.
 *
 * Runs inside tienda.mercadona.es with the user's own session, so no Mercadona
 * credentials ever reach Mi Cocina (Mercadona blocks requests from servers):
 *   1. reads the delivered orders Mi Cocina has not seen yet (slowly, to respect Mercadona),
 *   2. asks Mi Cocina for the cart plan computed from the weekly menu,
 *   3. adds every product to the Mercadona cart (never duplicating what is already there).
 * Loaded by the «Mi Cocina → Mercadona» bookmark (runs once) or left watching in
 * a logged-in Mercadona tab (data-mode="watch"), where it fills the cart each
 * time «Rellena la cesta automática» is pressed in the app's shopping list.
 * It never confirms orders or pays: the user reviews the cart and decides.
 */
(() => {
  "use strict";

  const script = document.currentScript;
  const config = Object.assign({}, window.__MICOCINA_CONFIG || {}, script ? script.dataset : {});
  const API = (config.api || "https://micocina.azurewebsites.net").replace(/\/+$/, "");
  const TOKEN = config.token || "";
  // Do not leave the access token readable in the page.
  if (script) script.remove();
  delete window.__MICOCINA_CONFIG;
  const SEARCH_URL = "https://tornillos.mercadona.es/search";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const HISTORY_DAYS = 365;
  const MAX_ORDERS_PER_RUN = 40;
  const ORDER_DELAY_MS = [2500, 3500];

  class BlockedError extends Error {}
  /** Problems the user can fix herself: shown as they are, without a technical prefix. */
  class NoticeError extends Error {}

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pause = ([min, max]) => sleep(min + Math.random() * (max - min));

  function mercadonaSession() {
    try {
      const user = JSON.parse(localStorage.getItem("MO-user") || "null");
      return user && user.token && user.uuid ? user : null;
    } catch {
      return null;
    }
  }

  let warehouse = "";
  const query = () => `lang=es${warehouse ? `&wh=${encodeURIComponent(warehouse)}` : ""}`;

  /** Mercadona briefly removes MO-user while it refreshes its token. */
  async function currentSession() {
    for (let attempt = 0; attempt < 5; attempt++) {
      const user = mercadonaSession();
      if (user) return user;
      await sleep(1000);
    }
    return null;
  }

  async function mercadona(path, options = {}) {
    const user = await currentSession();
    if (!user) throw new NoticeError("La sesión de Mercadona ha caducado: vuelve a iniciar sesión en Mercadona.");
    const response = await fetch(`/api${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${user.token}` },
    });
    if (response.status === 403) throw new BlockedError("Mercadona ha pedido ir más despacio.");
    if (!response.ok) {
      const error = new Error(`Mercadona respondió ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }

  async function micocina(path, options = {}) {
    const response = await fetch(`${API}/api/mercadona-connector${path}`, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Mi Cocina respondió ${response.status}`);
    return body;
  }

  // ── Overlay (shadow DOM so Mercadona's styles do not leak in) ───────────────

  function createPanel() {
    document.getElementById("micocina-connector")?.remove();
    const host = document.createElement("div");
    host.id = "micocina-connector";
    host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
    const root = host.attachShadow({ mode: "open" });
    root.innerHTML = `
      <style>
        .panel{width:min(440px,calc(100vw - 32px));max-height:calc(100vh - 32px);overflow:auto;background:#fff;color:#1f2937;
          border-radius:16px;box-shadow:0 20px 50px rgba(0,0,0,.25);font:14px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
        header{position:sticky;top:0;background:#047857;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:8px}
        header strong{flex:1;font-size:15px}
        button{font:inherit;cursor:pointer;border-radius:10px;border:1px solid #d1d5db;background:#fff;padding:6px 12px}
        button.primary{background:#047857;border-color:#047857;color:#fff;font-weight:600}
        button.close{background:transparent;border:0;color:#fff;font-size:20px;padding:0 4px}
        .body{padding:14px 16px}
        .status{margin:0 0 6px;color:#374151}
        .status.warn{color:#b45309}
        .status.error{color:#b91c1c;font-weight:600}
        .summary{background:#ecfdf5;border-radius:12px;padding:10px 12px;margin:10px 0;color:#065f46}
        h3{font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:#6b7280;margin:16px 0 6px}
        ul{list-style:none;margin:0;padding:0}
        li{display:flex;gap:8px;align-items:flex-start;padding:6px 0;border-bottom:1px solid #f3f4f6}
        li img{width:36px;height:36px;object-fit:cover;border-radius:8px;flex:none}
        li .text{flex:1;min-width:0}
        li .why{display:block;font-size:12px;color:#6b7280}
        .qty{font-weight:700;min-width:28px}
        .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
      </style>
      <div class="panel" role="dialog" aria-label="Mi Cocina → Mercadona">
        <header><strong>🛒 Mi Cocina → Mercadona</strong><button class="close" aria-label="Cerrar">×</button></header>
        <div class="body"><div class="log"></div><div class="result"></div></div>
      </div>`;
    document.body.appendChild(host);
    root.querySelector(".close").addEventListener("click", () => host.remove());
    const log = root.querySelector(".log");
    const result = root.querySelector(".result");
    let current = null;

    const line = (text, kind = "") => {
      const paragraph = document.createElement("p");
      paragraph.className = `status ${kind}`;
      paragraph.textContent = text;
      log.appendChild(paragraph);
      return paragraph;
    };

    return {
      root,
      step(text) { current = line(text); },
      progress(text) { if (current) current.textContent = text; else current = line(text); },
      warn(text) { line(text, "warn"); },
      error(text) { line(text, "error"); },
      result,
      remove() { host.remove(); },
    };
  }

  function element(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const child of children) if (child) node.append(child);
    return node;
  }

  function itemRow(quantity, name, why, thumbnail, action) {
    return element("li", {}, [
      thumbnail ? element("img", { src: thumbnail, alt: "" }) : null,
      element("span", { className: "qty", textContent: quantity ? `${quantity}×` : "–" }),
      element("span", { className: "text" }, [
        document.createTextNode(name),
        why ? element("span", { className: "why", textContent: why }) : null,
      ]),
      action,
    ]);
  }

  // ── Mercadona history ──────────────────────────────────────────────────────

  async function fetchOrderLines(user, orderId) {
    const lines = [];
    let page = 1;
    for (let guard = 0; guard < 10; guard++) {
      const data = await mercadona(`/customers/${user.uuid}/orders/${orderId}/lines/prepared/?${query()}${page > 1 ? `&page=${page}` : ""}`);
      for (const line of data.results || []) {
        const product = line.product || {};
        const price = product.price_instructions || {};
        lines.push({
          productId: String(line.product_id || product.id),
          name: product.display_name || "",
          quantity: Number(line.prepared_quantity ?? line.ordered_quantity ?? 0),
          category: (product.categories || []).map(category => category.name).join(" > ") || null,
          unitPrice: price.unit_price || null,
          thumbnail: product.thumbnail || null,
        });
      }
      if (!data.next_page) break;
      page = typeof data.next_page === "number" ? data.next_page : page + 1;
    }
    return lines;
  }

  async function syncHistory(user, ui) {
    ui.step("Comprobando tu historial de pedidos…");
    const state = await micocina("/state");
    const synced = new Set((state.syncedOrderIds || []).map(String));
    const cutoff = Date.now() - HISTORY_DAYS * DAY_MS;
    const orders = [];
    for (let page = 1; page <= 5; page++) {
      const data = await mercadona(`/customers/${user.uuid}/orders/?${query()}&page=${page}`);
      const results = data.results || [];
      orders.push(...results);
      if (!warehouse) warehouse = results.find(order => order.warehouse_code)?.warehouse_code || "";
      const oldest = results[results.length - 1];
      if (!data.next_page || !oldest || Date.parse(oldest.start_date) < cutoff) break;
      await pause([800, 1200]);
    }
    const pending = orders
      .filter(order => order.status_ui === "delivered" && Date.parse(order.start_date) >= cutoff && !synced.has(String(order.id)))
      .slice(0, MAX_ORDERS_PER_RUN);
    if (pending.length === 0) {
      ui.progress(`Historial al día (${synced.size} pedidos analizados).`);
      return;
    }
    let stored = 0;
    let batch = [];
    const flush = async () => {
      if (batch.length === 0) return;
      await micocina("/orders", { method: "POST", body: JSON.stringify({ orders: batch }) });
      stored += batch.length;
      batch = [];
    };
    for (const [index, order] of pending.entries()) {
      ui.progress(`Leyendo pedido ${index + 1} de ${pending.length} (${new Date(order.start_date).toLocaleDateString("es-ES")})…`);
      if (index > 0) await pause(ORDER_DELAY_MS);
      try {
        const lines = await fetchOrderLines(user, order.id);
        batch.push({
          orderId: String(order.id),
          deliveredAt: order.start_date,
          status: order.status_ui,
          total: order.summary?.products ?? order.price ?? null,
          lines,
        });
        if (batch.length >= 5) await flush();
      } catch (error) {
        if (error instanceof BlockedError) {
          ui.warn("Mercadona pide ir más despacio: sigo con los pedidos ya leídos y el resto se leerá la próxima vez.");
          break;
        }
        throw error;
      }
    }
    await flush();
    ui.progress(`Historial actualizado: ${stored} pedido${stored === 1 ? "" : "s"} nuevo${stored === 1 ? "" : "s"}.`);
  }

  // ── Catalogue search and cart ──────────────────────────────────────────────

  function searchAttempts(text) {
    const words = text.split(/\s+/).filter(Boolean);
    const attempts = [text];
    if (words.length > 2) attempts.push(words.slice(0, 2).join(" "));
    if (words.length > 1) attempts.push(words[0]);
    return [...new Set(attempts)];
  }

  const topCategory = text => (text || "").split(" > ")[0].trim().toLocaleLowerCase("es");
  const PREPARED = /rebozad|empanad|enharinad|frit[oa]s?\b|precocinad|palitos|figuritas|croquet|nuggets|varitas|a la romana|al huevo|al ajillo|en salsa/i;

  /** First relevant, available hit; among the top results, one she has bought before wins. */
  async function searchProduct(text, purchased, { exclude = new Set(), category = "", avoidPrepared = false } = {}) {
    const queries = Array.isArray(text) ? [...new Set(text.filter(Boolean))] : searchAttempts(text);
    for (const attempt of queries) {
      const response = await fetch(SEARCH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: attempt, wh: warehouse || undefined, lang: "es" }),
      });
      if (response.ok) {
        const data = await response.json();
        const available = (data.hits || []).filter(candidate =>
          candidate.published !== false && candidate.status !== "unavailable" && !exclude.has(String(candidate.id)) &&
          (!candidate.unavailable_from || Date.parse(candidate.unavailable_from) > Date.now()) &&
          (!category || topCategory(candidate.categories?.[0]?.name) === topCategory(category)) &&
          !(avoidPrepared && PREPARED.test(candidate.display_name || "")));
        const hit = available.slice(0, 5).find(candidate => purchased.has(String(candidate.id))) || available[0];
        if (hit) {
          return {
            productId: String(hit.id),
            productName: hit.display_name,
            thumbnail: hit.thumbnail || null,
            unitPrice: hit.price_instructions?.unit_price || null,
          };
        }
      }
      await sleep(400);
    }
    return null;
  }

  function cartLines(cart) {
    return (cart.lines || []).map(line => ({
      quantity: Number(line.quantity),
      product_id: String(line.product?.id ?? line.product_id),
      sources: line.sources && line.sources.length ? line.sources : ["+SA"],
    }));
  }

  /** Read-modify-write of the whole cart: products already there keep the larger quantity. */
  async function putItems(user, items, remove = new Set()) {
    let lastError;
    for (let attempt = 0; attempt < 3; attempt++) {
      const cart = await mercadona(`/customers/${user.uuid}/cart/?${query()}`);
      const lines = cartLines(cart).filter(line => !remove.has(line.product_id));
      const byId = new Map(lines.map(line => [line.product_id, line]));
      for (const item of items) {
        const existing = byId.get(item.productId);
        if (existing) existing.quantity = Math.max(existing.quantity, item.quantity);
        else {
          const line = { quantity: item.quantity, product_id: item.productId, sources: ["+SA"] };
          lines.push(line);
          byId.set(item.productId, line);
        }
      }
      try {
        const updated = await mercadona(`/customers/${user.uuid}/cart/?${query()}`, {
          method: "PUT",
          body: JSON.stringify({ id: cart.id, version: cart.version, lines }),
        });
        return { updated };
      } catch (error) {
        lastError = error;
        if (error instanceof BlockedError || (error.status && error.status !== 409 && error.status !== 400)) throw error;
        await sleep(800 * (attempt + 1));
      }
    }
    throw lastError;
  }

  async function addToCart(user, items, ui) {
    try {
      return await putItems(user, items);
    } catch (error) {
      if (error instanceof BlockedError || items.length <= 1) throw error;
      // One rejected product must not block the rest: retry product by product.
      ui.warn("Mercadona rechazó la cesta completa; añadiendo los productos uno a uno…");
      let last = null;
      for (const item of items) {
        try {
          last = await putItems(user, [item]);
        } catch (itemError) {
          if (itemError instanceof BlockedError) throw itemError;
          item.rejected = true;
        }
        await sleep(600);
      }
      if (!last) throw error;
      return last;
    }
  }

  // ── Main flows ─────────────────────────────────────────────────────────────

  function describeResult(ui, outcome) {
    const { added, kept, missing } = outcome;
    ui.result.replaceChildren();
    ui.result.append(element("div", {
      className: "summary",
      textContent: `✅ ${added.length} producto${added.length === 1 ? "" : "s"} añadido${added.length === 1 ? "" : "s"} o actualizado${added.length === 1 ? "" : "s"}` +
        `${kept.length ? `, ${kept.length} ya estaba${kept.length === 1 ? "" : "n"} en el carro` : ""}` +
        `${outcome.total ? `. Total aproximado del carro: ${outcome.total} €` : ""}.`,
    }));
    const section = (title, rows) => {
      if (rows.length === 0) return;
      ui.result.append(element("h3", { textContent: title }), element("ul", {}, rows));
    };
    section("Añadido al carro", added.map(item => itemRow(item.quantity, item.productName, item.reason, item.thumbnail)));
    section("Ya estaba en el carro", kept.map(item => itemRow(item.inCart, item.productName, "No se ha sumado nada.", item.thumbnail)));
    section("No encontrado", missing.map(item => itemRow(0, item.ingredients.join(", "), item.reason)));
    const reload = element("button", { className: "primary", textContent: "Ver el carro" });
    reload.addEventListener("click", () => location.reload());
    ui.result.append(element("div", { className: "actions" }, [reload]));
  }

  const lineProductId = line => String(line.product?.id ?? line.product_id);
  const isUnavailable = line => Boolean(line && line.product && line.product.status === "unavailable");

  async function applyPlan(plan, ui, user) {
    const items = (plan.items || []).map(item => ({ ...item }));
    const purchased = new Set((plan.purchasedProductIds || []).map(String));
    const toSearch = items.filter(item => !item.productId && item.searchQuery);
    for (const [index, item] of toSearch.entries()) {
      ui.progress(`Buscando en Mercadona ${index + 1} de ${toSearch.length}: ${item.searchQuery}…`);
      const hit = await searchProduct(item.searchQuery, purchased);
      if (hit) Object.assign(item, hit, { reason: `${item.reason} Encontrado: ${hit.productName}.` });
    }
    const ready = [];
    for (const item of items.filter(candidate => candidate.productId && candidate.quantity > 0)) {
      const same = ready.find(candidate => candidate.productId === item.productId);
      if (!same) ready.push(item);
      else {
        same.quantity = Math.max(same.quantity, item.quantity);
        same.ingredients = [...new Set([...same.ingredients, ...item.ingredients])];
      }
    }
    const missing = items.filter(item => !item.productId);
    ui.step(`Añadiendo ${ready.length} productos al carro…`);
    // Snapshot before any write: retries and the one-by-one fallback must not turn new products into "already there".
    const initial = await mercadona(`/customers/${user.uuid}/cart/?${query()}`);
    const before = new Map(cartLines(initial).map(line => [line.product_id, line.quantity]));
    let { updated } = await addToCart(user, ready, ui);

    // Products she usually buys can be out of stock or out of season: offer the closest available one.
    let lines = new Map((updated.lines || []).map(line => [lineProductId(line), line]));
    const unavailable = ready.filter(item => isUnavailable(lines.get(item.productId)));
    if (unavailable.length > 0) {
      const unavailableIds = new Set(unavailable.map(item => item.productId));
      const alternatives = [];
      for (const [index, item] of unavailable.entries()) {
        ui.progress(`Buscando alternativa ${index + 1} de ${unavailable.length} para «${item.productName}» (no disponible)…`);
        // Same product line first, then the ingredient within the same section. Fresh fish or meat may
        // become its frozen version; fruit and vegetables stay fresh.
        const crossSection = /pescado|marisco|carne/i.test(item.category || "");
        const options = {
          exclude: unavailableIds,
          category: crossSection ? "" : item.category || "",
          avoidPrepared: !PREPARED.test(`${item.productName} ${item.ingredients.join(" ")}`),
        };
        const hit = await searchProduct([item.productName], purchased, options) ||
          await searchProduct(item.searchQuery || item.ingredients[0], purchased, options);
        if (hit) {
          const replaced = item.productName;
          Object.assign(item, hit, { reason: `«${replaced}» no está disponible ahora; alternativa: ${hit.productName}.` });
          alternatives.push({ productId: item.productId, quantity: item.quantity });
        } else {
          item.unavailable = true;
        }
      }
      // Unavailable lines cannot be delivered, so they leave the cart.
      ({ updated } = await putItems(user, alternatives, unavailableIds));
      lines = new Map((updated.lines || []).map(line => [lineProductId(line), line]));
    }

    const added = [];
    const kept = [];
    for (const item of ready) {
      const line = lines.get(item.productId);
      const quantity = line ? Number(line.quantity) : 0;
      if (item.unavailable || isUnavailable(line)) {
        missing.push({ ...item, reason: `«${item.productName}» no está disponible ahora en Mercadona y no hay alternativa clara.` });
        continue;
      }
      if (!quantity || item.rejected) { missing.push({ ...item, reason: "Mercadona no lo ha aceptado (puede que no esté disponible)." }); continue; }
      if ((before.get(item.productId) || 0) >= item.quantity) kept.push({ ...item, inCart: quantity });
      else added.push({ ...item, quantity });
    }
    ui.progress(`Carro actualizado: ${updated.products_count ?? lines.size} productos disponibles.`);
    return { added, kept, missing, total: updated.summary?.total || null };
  }

  async function run(options = {}) {
    if (window.__micocinaConnectorBusy) throw new NoticeError("Ya se está llenando el carro.");
    window.__micocinaConnectorBusy = true;
    const ui = createPanel();
    try {
      if (location.hostname !== "tienda.mercadona.es") {
        throw new NoticeError("Abre tienda.mercadona.es, inicia sesión y vuelve a pulsar el marcador «Mi Cocina → Mercadona».");
      }
      const user = await currentSession();
      if (!user) throw new NoticeError("Inicia sesión en Mercadona y vuelve a intentarlo.");
      let plan = options.plan;
      if (!plan) {
        if (!TOKEN) throw new NoticeError("Falta el acceso de Mi Cocina. Vuelve a conectar Mercadona desde la página Mercadona de Mi Cocina.");
        await syncHistory(user, ui);
        ui.step("Calculando la cesta con tu menú semanal…");
        plan = await micocina("/plan", { method: "POST", body: JSON.stringify({}) });
        ui.progress(`Cesta calculada para ${plan.menuLabel || "tu menú"}: ${plan.items.length} productos.`);
      } else if (!warehouse) {
        const data = await mercadona(`/customers/${user.uuid}/orders/?${query()}&page=1`);
        warehouse = (data.results || []).find(order => order.warehouse_code)?.warehouse_code || "";
      }
      const outcome = await applyPlan(plan, ui, user);
      describeResult(ui, outcome);
      if (plan.id && TOKEN) {
        await micocina(`/plan/${plan.id}/result`, {
          method: "POST",
          body: JSON.stringify({
            added: outcome.added.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity })),
            kept: outcome.kept.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.inCart })),
            missing: outcome.missing.map(item => ({ ingredients: item.ingredients, reason: item.reason })),
            cartTotal: outcome.total,
          }),
        }).catch(() => ui.warn("La cesta está en Mercadona, pero no se pudo guardar el resumen en Mi Cocina."));
      }
      return outcome;
    } catch (error) {
      ui.error(error instanceof BlockedError
        ? "Mercadona ha pedido ir más despacio. Espera unos minutos y vuelve a intentarlo."
        : error instanceof NoticeError ? error.message : `No se pudo completar: ${error.message}`);
      throw error;
    } finally {
      window.__micocinaConnectorBusy = false;
    }
  }

  // ── Watching: fills the cart when «Rellena la cesta automática» is pressed in the app ──

  const WATCH_INTERVAL_MS = 15000;
  /** Reloading lets Mercadona refresh its session; the watching tab re-injects the connector on load. */
  const WATCH_RELOAD_MS = 6 * 60 * 60 * 1000;

  function requestSummary(outcome) {
    const inCart = [...outcome.added.map(item => item.quantity), ...outcome.kept.map(item => item.inCart)];
    const notes = [
      ...outcome.added.filter(item => /alternativa/.test(item.reason || "")).map(item => item.reason),
      ...outcome.missing.map(item => `${item.ingredients.join(", ")}: ${item.reason}`),
    ];
    return {
      status: "done",
      message: notes.join(" · ").slice(0, 490) || null,
      summary: { products: inCart.length, units: inCart.reduce((total, quantity) => total + Number(quantity || 0), 0), total: outcome.total },
    };
  }

  async function fulfil(request) {
    let report;
    try {
      report = requestSummary(await run());
    } catch (error) {
      report = {
        status: "error",
        message: error instanceof BlockedError
          ? "Mercadona ha pedido ir más despacio. Espera unos minutos y vuelve a pulsar el botón."
          : error.message || "No se pudo llenar el carro.",
      };
    }
    await micocina(`/requests/${request.id}/finish`, { method: "POST", body: JSON.stringify(report) }).catch(() => {});
  }

  function watch() {
    if (window.__micocinaWatching) return;
    window.__micocinaWatching = true;
    const loadedAt = Date.now();
    const tick = async () => {
      try {
        if (!window.__micocinaConnectorBusy) {
          const { request } = await micocina("/requests/claim", { method: "POST", body: "{}" });
          if (request) await fulfil(request);
          else if (Date.now() - loadedAt > WATCH_RELOAD_MS) {
            location.reload();
            return;
          }
        }
      } catch {
        // Network blips or an expired session: try again on the next tick.
      }
      setTimeout(tick, WATCH_INTERVAL_MS);
    };
    tick();
  }

  window.__micocinaConnector = { run, watch, version: 2 };
  if (config.mode === "watch") watch();
  else if (config.autorun !== "false") run().catch(() => {});
})();
