import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import express from "express";
import { GetShoppingListResponse } from "@workspace/api-zod";

const testUrl = process.env.WHATSAPP_TEST_DATABASE_URL;

function parseShoppingResponse(value: unknown) {
  assert.ok(value && typeof value === "object" && "generatedAt" in value);
  assert.ok(typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)));
  return GetShoppingListResponse.omit({ generatedAt: true }).parse(value);
}

test("WhatsApp webhook, account linking, durable queue and shared shopping list", { skip: !testUrl }, async t => {
  const url = new URL(testUrl!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/whatsapp_test",
    "Integration tests require an isolated local database named whatsapp_test");
  process.env.DATABASE_URL = testUrl;
  const { pool } = await import("@workspace/db");
  t.after(() => pool.end());
  const store = await import("./whatsapp-store");
  const service = await import("./whatsapp-service");
  const { createWhatsAppWebhook } = await import("../routes/whatsapp-webhook");
  const { default: accountRouter } = await import("../routes/whatsapp");
  const { default: shoppingRouter } = await import("../routes/shopping");
  const { requireUser } = await import("../middlewares/auth");
  const { processWhatsAppJob } = await import("./whatsapp-worker");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY, name text NOT NULL, avatar text DEFAULT '', email text,
      password_hash text, mercadona_email text, azure_endpoint text, azure_deployment text, azure_api_key text,
      created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS recipes (
      id serial PRIMARY KEY, user_id integer REFERENCES users(id), name text, category text,
      ingredients text[] DEFAULT '{}', instructions text, created_at timestamp DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS weekly_menus (
      id serial PRIMARY KEY, user_id integer REFERENCES users(id), days jsonb, created_at timestamp DEFAULT now()
    );
  `);
  await service.initializeWhatsAppService();
  await service.initializeWhatsAppService();
  await pool.query("TRUNCATE whatsapp_messages, whatsapp_links, whatsapp_ingredients, recipes, weekly_menus, users RESTART IDENTITY CASCADE");
  const passwordHash = createHash("sha256").update("menu-planner-salt-2026test-password").digest("hex");
  await pool.query("INSERT INTO users(name, password_hash) VALUES ('Alice', $1), ('Bob', $1)", [passwordHash]);
  await pool.query("INSERT INTO recipes(user_id, name, category, ingredients) VALUES (1, 'Crema', 'primero', ARRAY['leche'])");
  await pool.query("INSERT INTO weekly_menus(user_id, days) VALUES (1, $1)", [JSON.stringify([{ lunch: { primero: { id: 1 } } }])]);

  const config = { appSecret: "test-secret", verifyToken: "test-verify", accessToken: "test-only", phoneNumberId: "123", businessNumber: "34600000000", graphVersion: "v23.0" };
  Object.assign(process.env, {
    WHATSAPP_APP_SECRET: config.appSecret, WHATSAPP_VERIFY_TOKEN: config.verifyToken,
    WHATSAPP_ACCESS_TOKEN: config.accessToken, WHATSAPP_PHONE_NUMBER_ID: config.phoneNumberId,
    WHATSAPP_BUSINESS_NUMBER: config.businessNumber, WHATSAPP_GRAPH_VERSION: config.graphVersion,
  });
  let available = true;
  const app = express();
  app.use("/api/whatsapp", createWhatsAppWebhook({ config: () => config, ready: () => available, enqueue: store.enqueueWhatsApp }));
  app.use(express.json(), requireUser, accountRouter, shoppingRouter);
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const api = (path: string, user = 1, method = "GET", body?: unknown) => fetch(`${base}${path}`, {
    method, headers: { "X-User-Id": String(user), "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const webhook = (id: string, text: string, phone = "34600000001", signatureValid = true) => {
    const body = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{
      field: "messages", value: { metadata: { phone_number_id: "123" }, messages: [{ id, from: phone, type: "text", text: { body: text } }] },
    }] }] });
    const signature = createHmac("sha256", config.appSecret).update(body).digest("hex");
    return fetch(`${base}/api/whatsapp/webhook`, {
      method: "POST", headers: { "Content-Type": "application/json", "X-Hub-Signature-256": `sha256=${signatureValid ? signature : "0".repeat(64)}` }, body,
    });
  };
  const replies: string[] = [];
  const drain = () => processWhatsAppJob({
    claim: store.claimWhatsAppJob, process: store.processWhatsAppCommand,
    send: async (_phone, reply) => { replies.push(reply); },
    delivered: async id => { await pool.query("UPDATE whatsapp_messages SET state = 'delivered' WHERE id = $1", [id]); },
  });

  await t.test("verification, invalid signatures, availability and anonymous callers", async () => {
    const verified = await fetch(`${base}/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=42`);
    assert.equal(verified.status, 200);
    assert.equal(await verified.text(), "42");
    assert.equal((await fetch(`${base}/api/whatsapp/webhook?hub.verify_token=bad`)).status, 403);
    assert.equal((await webhook("bad", "añade pan", undefined, false)).status, 403);
    available = false;
    assert.equal((await webhook("unavailable", "añade pan")).status, 503);
    available = true;
    assert.equal((await fetch(`${base}/whatsapp/status`)).status, 401);
    assert.equal((await pool.query("SELECT * FROM whatsapp_messages")).rowCount, 0);
  });

  await t.test("unlinked phones cannot write; password and one-use code bind account", async () => {
    await webhook("unlinked", "añade pan");
    await drain();
    assert.match(replies.at(-1)!, /Vincula primero/);
    assert.deepEqual(await store.listWhatsAppIngredients(1), []);
    assert.equal((await api("/whatsapp/link", 1, "POST", { password: "wrong" })).status, 401);
    const linked = await api("/whatsapp/link", 1, "POST", { password: "test-password" });
    assert.equal(linked.status, 200);
    const body: unknown = await linked.json();
    assert.ok(body && typeof body === "object" && "code" in body && typeof body.code === "string");
    const { code } = body;
    assert.match(code, /^[a-f0-9]{32}$/);
    assert.equal((await webhook("link", `vincular ${code}`)).status, 200);
    await drain();
    assert.match(replies.at(-1)!, /Cuenta vinculada/);
    await webhook("reuse", `vincular ${code}`, "34600000002");
    await drain();
    assert.match(replies.at(-1)!, /inválido o caducado/);
    const status: unknown = await (await api("/whatsapp/status")).json();
    assert.ok(status && typeof status === "object" && "phone" in status);
    assert.equal(status.phone, "***0001");
  });

  await t.test("same list as menu, deduplication, quantities and cross-user isolation", async () => {
    await webhook("groceries", "añade leche, pan y 2 kg de tomates");
    await drain();
    await webhook("groceries", "añade leche, pan y 2 kg de tomates");
    assert.equal(await drain(), false);
    assert.equal((await store.listWhatsAppIngredients(1)).length, 3);
    const response = await api("/shopping-list/1");
    assert.equal(response.status, 200);
    const shopping = parseShoppingResponse(await response.json());
    assert.equal(shopping.items.length, 3);
    assert.deepEqual(shopping.items[0].recipes, ["Crema", "WhatsApp"]);
    assert.equal(parseShoppingResponse(await (await api("/shopping-list/0")).json()).items.length, 3);
    assert.deepEqual(await store.listWhatsAppIngredients(2), []);
    assert.equal((await api("/shopping-list/1", 2)).status, 404);
    const extras = await store.listWhatsAppIngredients(1);
    assert.equal((await api(`/whatsapp/ingredients/${extras[0].id}`, 2, "DELETE")).status, 404);
    assert.equal((await api(`/whatsapp/ingredients/${extras[0].id}`, 1, "DELETE")).status, 204);
    await webhook("groceries", "añade leche, pan y 2 kg de tomates");
    assert.equal(await drain(), false);
    const afterDelete = parseShoppingResponse(await (await api("/shopping-list/1")).json());
    assert.deepEqual(afterDelete.items[0].recipes, ["Crema"]);
    const generated = parseShoppingResponse(await (await api("/shopping-list/generate", 1, "POST", { menuId: 1 })).json());
    assert.deepEqual(generated.items, afterDelete.items);
  });

  await t.test("transaction rollback prevents partial ingredients and stale work recovers", async () => {
    await pool.query("ALTER TABLE whatsapp_ingredients ADD CONSTRAINT test_failure CHECK (ingredient <> 'fail')");
    await webhook("atomic", "añade arroz y fail");
    const job = await store.claimWhatsAppJob();
    assert.ok(job);
    await assert.rejects(store.processWhatsAppCommand(job));
    assert.equal((await pool.query("SELECT * FROM whatsapp_ingredients WHERE ingredient = 'arroz'")).rowCount, 0);
    assert.equal((await pool.query("SELECT reply FROM whatsapp_messages WHERE id = 'atomic'")).rows[0].reply, null);
    await pool.query("ALTER TABLE whatsapp_ingredients DROP CONSTRAINT test_failure");
    await pool.query("UPDATE whatsapp_messages SET updated_at = now() - interval '2 minutes' WHERE id = 'atomic'");
    await drain();
    assert.match(replies.at(-1)!, /arroz, fail/);
  });

  await t.test("a reply failure never repeats a completed write, even after removal", async () => {
    await webhook("reply-retry", "añade sal");
    const job = await store.claimWhatsAppJob();
    assert.ok(job);
    const reply = await store.processWhatsAppCommand(job);
    await pool.query("DELETE FROM whatsapp_ingredients WHERE ingredient = 'sal'");
    await pool.query("UPDATE whatsapp_messages SET updated_at = now() - interval '2 minutes' WHERE id = 'reply-retry'");
    await drain();
    assert.equal(replies.at(-1), reply);
    assert.equal((await pool.query("SELECT * FROM whatsapp_ingredients WHERE ingredient = 'sal'")).rowCount, 0);
    await webhook("concurrent", "añade limón");
    const claims = await Promise.all([store.claimWhatsAppJob(), store.claimWhatsAppJob()]);
    assert.equal(claims.filter(Boolean).length, 1);
    await store.processWhatsAppCommand(claims.find(job => job !== undefined)!);
    await pool.query("UPDATE whatsapp_messages SET state = 'delivered' WHERE id = 'concurrent'");
  });

  await t.test("expired codes, unlinking and unsupported commands do not add ingredients", async () => {
    const code = await store.createLinkCode(2);
    await pool.query("UPDATE whatsapp_links SET code_expires_at = now() - interval '1 minute' WHERE user_id = 2");
    await webhook("expired", `vincular ${code}`, "34600000002");
    await drain();
    assert.match(replies.at(-1)!, /inválido o caducado/);
    await webhook("unsupported", "mercadona: aceite");
    await drain();
    assert.match(replies.at(-1)!, /no se modifica el carrito/);
    assert.equal((await api("/whatsapp/unlink", 1, "POST", { password: "test-password" })).status, 200);
    await webhook("after-unlink", "añade chocolate");
    await drain();
    assert.match(replies.at(-1)!, /Vincula primero/);
    assert.equal((await pool.query("SELECT * FROM whatsapp_ingredients WHERE ingredient = 'chocolate'")).rowCount, 0);
  });
});
