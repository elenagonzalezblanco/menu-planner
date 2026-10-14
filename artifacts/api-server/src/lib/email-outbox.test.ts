import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import { EmailClient } from "@azure/communication-email";
import { AzureEmailProvider } from "./azure-email";
import {
  EmailConfigurationError, EmailRepository, IdempotencyConflict, MAX_ATTEMPTS, processEmail, requestHash, retryDelay,
  type EmailJob, type ProviderOutcome, type WorkerRepository,
} from "./email-outbox";
import {
  menuMessage, shoppingMessage, validateMenu, validateShopping, validateRecipient,
} from "./email-content";

const snapshot = shoppingMessage({ items: [{ ingredient: "<tomate>", recipes: ["A&B"] }], extraItems: ["<script>"] }, "test@example.com");
function job(): EmailJob {
  return {
    id: randomUUID(), operation_id: randomUUID(), user_id: 1, status: "sending",
    recipient: "test@example.com", error: null, snapshot, resume_from: null,
    provider_started: false, terminal_failure: false, attempts: 1, lease_token: randomUUID(),
  };
}

test("validates nested payloads and escapes all HTML, preserving extras and the PDF snapshot", () => {
  for (const payload of [null, {}, { days: [] }, { days: [{ day: 7, lunch: {}, dinner: {} }] },
    { days: [{ day: "Lunes", lunch: { primero: { name: [] } }, dinner: {} }] }]) {
    assert.throws(() => validateMenu(payload));
  }
  for (const payload of [{ items: "bad" }, { items: [{ ingredient: "a", recipes: "bad" }] }, { items: [], extraItems: [3] }]) {
    assert.throws(() => validateShopping(payload));
  }
  assert.throws(() => validateRecipient("bad\r\nBcc:someone@example.com"));
  const payload = { days: [{ day: "<Lunes>", lunch: { primero2: { name: "A&B" }, segundo2: { name: "<extra>" } }, dinner: null }] };
  validateMenu(payload);
  const result = menuMessage(payload, "test@example.com", () => Buffer.from("unchanged PDF"));
  assert.match(result.content.html!, /&lt;Lunes&gt;/);
  assert.match(result.content.html!, /A&amp;B/);
  assert.match(result.content.html!, /&lt;extra&gt;/);
  assert.equal(result.attachments![0]!.contentInBase64, Buffer.from("unchanged PDF").toString("base64"));
  assert.match(snapshot.content.html!, /&lt;script&gt;/);
  assert.doesNotMatch(snapshot.content.html!, /<script>/);
});

test("canonical request hash ignores property order but detects content, extras and endpoint changes", () => {
  assert.equal(requestHash("shopping", { items: [], extraItems: ["x"] }), requestHash("shopping", { extraItems: ["x"], items: [] }));
  assert.notEqual(requestHash("shopping", { items: [], extraItems: ["x"] }), requestHash("shopping", { items: [], extraItems: ["y"] }));
  assert.notEqual(requestHash("menu", {}), requestHash("shopping", {}));
  assert.equal(retryDelay(1), 2000);
  assert.equal(retryDelay(30), 300000);
});

test("worker durably prepares operation before I/O, resumes after restart and caps attempts", async () => {
  const current = job();
  let prepared = false;
  let outcome: ProviderOutcome | undefined;
  const repo: WorkerRepository = {
    async claim() { return current; },
    async prepare(_job, resume) { prepared = true; assert.equal(resume, "checkpoint"); return true; },
    async finish(_job, result) { outcome = result; },
  };
  const calls: boolean[] = [];
  const provider = {
    checkpoint() { return "checkpoint"; },
    async step(j: EmailJob, submit: boolean): Promise<ProviderOutcome> {
      assert.equal(prepared, true);
      assert.equal(j.provider_started, true);
      calls.push(submit);
      if (submit) throw new Error("timeout");
      return { status: "succeeded" };
    },
  };
  await processEmail(repo, provider, () => {});
  assert.equal(outcome!.status, "transient");
  prepared = false;
  await processEmail(repo, provider, () => {});
  assert.deepEqual(calls, [true, false]);
  assert.equal(outcome!.status, "succeeded");
  current.attempts = MAX_ATTEMPTS + 1;
  await processEmail(repo, provider, () => {});
  assert.equal(outcome!.status, "failed");
  assert.equal(calls.length, 2);
});

test("lost lease never starts provider I/O", async () => {
  const repo: WorkerRepository = {
    async claim() { return job(); }, async prepare() { return false; },
    async finish() { assert.fail("cannot finish another owner's lease"); },
  };
  await processEmail(repo, {
    checkpoint: () => "checkpoint",
    async step() { assert.fail("must not send after lease lost"); },
  }, () => {});
});

test("missing configuration fails visibly without provider I/O", async () => {
  let outcome: ProviderOutcome | undefined;
  await processEmail({
    async claim() { return job(); },
    async prepare() { assert.fail("configuration should fail first"); },
    async finish(_job, result) { outcome = result; },
  }, {
    checkpoint() { throw new EmailConfigurationError(); },
    async step() { assert.fail("must not send"); },
  }, () => {});
  assert.deepEqual(outcome, { status: "failed", terminal: true });
});

test("provider deadline aborts a hanging request and preserves ambiguous state", async () => {
  const provider = new AzureEmailProvider({
    async beginSend(_message, options) {
      assert.equal(options!.requestOptions!.timeout, 10);
      return await new Promise((_resolve, reject) => {
        options!.abortSignal!.addEventListener("abort", () => reject(new Error("aborted")));
      });
    },
  }, "https://unit-test.communication.azure.com", 10);
  assert.deepEqual(await provider.step(job(), true), { status: "transient" });
});

// Exercise the INSTALLED ACS SDK against an in-memory HTTP transport: no real
// network request or credential is used, including on retry/error paths.
function sdkProvider(responses: { code: number; status?: string; fail?: boolean }[]) {
  const requests: { method: string; url: string; operationId?: string }[] = [];
  const client = new EmailClient("https://unit-test.communication.azure.com", { key: Buffer.from("fake").toString("base64") }, {
    retryOptions: { maxRetries: 0 },
    httpClient: {
      async sendRequest(request) {
        requests.push({ method: request.method, url: request.url, operationId: request.headers.get("operation-id") });
        const response = responses.shift();
        assert.ok(response, "unexpected SDK HTTP request");
        if (response.fail) throw new Error("fake transport timeout");
        const headers = request.headers;
        headers.set("content-type", "application/json");
        headers.set("operation-location", "https://unit-test.communication.azure.com/emails/operations/11111111-1111-4111-8111-111111111111?api-version=2023-03-31");
        return {
          request, status: response.code, headers,
          bodyAsText: JSON.stringify({ id: "11111111-1111-4111-8111-111111111111", status: response.status,
            ...(response.code >= 400 || response.status === "Failed" ? { error: { code: "TestError", message: "PRIVATE PROVIDER DETAIL" } } : {}) }),
        };
      },
    },
  });
  return { provider: new AzureEmailProvider(client, "https://unit-test.communication.azure.com"), requests };
}

test("installed ACS SDK receives Operation-Id and serializes/restores polling without another POST", async () => {
  const { provider, requests } = sdkProvider([{ code: 202, status: "Running" }, { code: 200, status: "Running" }, { code: 200, status: "Succeeded" }]);
  const current = job();
  current.resume_from = provider.checkpoint(current.operation_id);
  const first = await provider.step(current, true);
  assert.equal(first.status, "pending");
  assert.ok(first.resumeFrom);
  current.resume_from = first.resumeFrom!;
  const second = await provider.step(current, false);
  assert.equal(second.status, "succeeded");
  assert.deepEqual(requests.map(r => r.method), ["POST", "GET", "GET"]);
  assert.equal(requests[0]!.operationId, current.operation_id);
});

test("pre-I/O checkpoint restores a lost initial response with GET only", async () => {
  const { provider, requests } = sdkProvider([{ code: 200, status: "Succeeded" }]);
  const current = job();
  current.resume_from = provider.checkpoint(current.operation_id);
  assert.equal((await provider.step(current, false)).status, "succeeded");
  assert.deepEqual(requests.map(r => r.method), ["GET"]);
  assert.match(requests[0]!.url, new RegExp(current.operation_id));
});

test("missing or expired unknown provider operations are never submitted again", async () => {
  const { provider, requests } = sdkProvider([{ code: 404 }, { code: 404 }]);
  const current = job();
  current.provider_started = true;
  current.resume_from = provider.checkpoint(current.operation_id);
  for (let i = 0; i < 2; i++) {
    assert.deepEqual(await provider.step(current, false), { status: "transient" });
  }
  assert.deepEqual(requests.map(r => r.method), ["GET", "GET"]);
  assert.ok(requests.every(r => r.url.includes(current.operation_id)));
});

test("ACS terminal Failed is distinct from unknown and polling failures never allow resubmission", async () => {
  for (const [responses, expected] of [
    [[{ code: 202, status: "Running" }, { code: 200, status: "Failed" }], { status: "failed", terminal: true }],
    [[{ code: 202, status: "Running" }, { code: 401 }], { status: "transient" }],
    [[{ code: 429 }], { status: "transient", resubmit: true }],
    [[{ code: 400 }], { status: "failed", terminal: true }],
    [[{ code: 500 }], { status: "transient" }],
    [[{ code: 0, fail: true }], { status: "transient" }],
  ] as const) {
    const { provider } = sdkProvider(responses.map(r => ({ ...r })));
    const result = await provider.step(job(), true);
    assert.equal(result.status, expected.status);
    assert.equal(result.terminal, "terminal" in expected ? expected.terminal : undefined);
    assert.equal(result.resubmit, "resubmit" in expected ? expected.resubmit : undefined);
  }
});

test("Postgres outbox: migration, concurrent dedupe/leases, snapshot retention, fencing, user scoping and retries", {
  skip: !process.env.EMAIL_TEST_DATABASE_URL,
}, async () => {
  // Explicit opt-in URL only. Use a dedicated schema; never use application
  // DATABASE_URL automatically, and always clean up the schema.
  const schema = `email_test_${randomUUID().replaceAll("-", "")}`;
  const url = new URL(process.env.EMAIL_TEST_DATABASE_URL!);
  url.searchParams.set("options", `-c search_path=${schema}`);
  process.env.DATABASE_URL = url.toString();
  const { pool } = await import("@workspace/db");
  const a = await pool.connect();
  const b = await pool.connect();
  try {
    await a.query(`CREATE SCHEMA ${schema}`);
    await a.query(`SET search_path TO ${schema}`);
    await b.query(`SET search_path TO ${schema}`);
    await a.query("CREATE TABLE users (id integer PRIMARY KEY, email text); INSERT INTO users VALUES (1,'first@example.com'),(2,'second@example.com')");
    const first = new EmailRepository(a);
    const second = new EmailRepository(b);
    await Promise.all([first.initialize(), second.initialize()]);
    const key = randomUUID();
    const deliveries = await Promise.all([
      first.enqueue(1, key, "hash", snapshot), second.enqueue(1, key, "hash", snapshot),
    ]);
    assert.equal(deliveries[0]!.id, deliveries[1]!.id);
    await assert.rejects(first.enqueue(1, key, "changed", snapshot), IdempotencyConflict);
    assert.equal(await first.get(2, deliveries[0]!.id), undefined);
    assert.equal(await first.retry(2, deliveries[0]!.id), undefined);
    const claims = await Promise.all([first.claim(), second.claim()]);
    assert.equal(claims.filter(Boolean).length, 1);
    const claimed = claims.find(Boolean)!;
    assert.deepEqual(claimed.snapshot, snapshot);
    assert.ok(claimed.operation_id);
    assert.equal(await first.prepare(claimed, "saved-resume"), true);
    await a.query("UPDATE email_deliveries SET lease_until=now()-interval '1 second' WHERE id=$1", [claimed.id]);
    const reclaimed = (await second.claim())!;
    assert.equal(reclaimed.operation_id, claimed.operation_id);
    assert.equal(reclaimed.resume_from, "saved-resume");
    assert.equal(reclaimed.provider_started, true);
    await first.finish(claimed, { status: "succeeded" });
    assert.equal((await first.get(1, claimed.id))!.status, "sending");
    await second.finish(reclaimed, { status: "failed" });
    assert.equal((await first.retry(1, claimed.id))!.status, "queued");
    const unknownRetry = (await first.claim())!;
    assert.equal(unknownRetry.operation_id, claimed.operation_id);
    assert.equal(unknownRetry.resume_from, "saved-resume");
    await first.finish(unknownRetry, { status: "failed", terminal: true });
    const manual = await first.retry(1, claimed.id);
    assert.equal(manual!.id, claimed.id);
    assert.equal(await first.retry(1, claimed.id), undefined);
    const terminalRetry = (await first.claim())!;
    assert.notEqual(terminalRetry.operation_id, claimed.operation_id);
    assert.equal(terminalRetry.resume_from, null);
    assert.equal(terminalRetry.provider_started, false);
    assert.deepEqual(terminalRetry.snapshot, snapshot);
    await first.finish(terminalRetry, { status: "succeeded" });
    for (let i = 0; i < 22; i++) await first.enqueue(1, randomUUID(), String(i), snapshot);
    assert.equal((await first.list(1)).length, 20);
    assert.deepEqual(await first.list(2), []);
    await a.query("UPDATE email_deliveries SET status=CASE WHEN id=$1 THEN 'failed' ELSE 'succeeded' END", [claimed.id]);
    const sleeping = await first.enqueue(1, randomUUID(), "sleeping", snapshot);
    await a.query("UPDATE email_deliveries SET created_at=now()-interval '10 days' WHERE id=$1", [sleeping.id]);
    const prioritized = await first.list(1);
    assert.equal(prioritized[0]!.id, sleeping.id);
    assert.equal(prioritized[1]!.id, claimed.id);
    assert.equal(prioritized.length, 20);
    assert.ok(prioritized.slice(2).every(delivery => delivery.status === "succeeded"));

    const { initializeEmailOutbox } = await import("./email-service");
    const { default: router } = await import("../routes/email");
    await initializeEmailOutbox();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as import("../middlewares/auth").AuthenticatedRequest).user = { id: Number(req.get("X-User-Id") ?? 1), name: "Test" };
      next();
    });
    app.use("/api", router);
    const server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}/api/email`;
    const request = (path: string, body?: unknown, key?: string, user = 1) => fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", "X-User-Id": String(user), ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(5_000),
    });
    try {
      const body = { items: [{ ingredient: "tomate", recipes: ["ensalada"] }], extraItems: ["pan"] };
      assert.equal((await request("/shopping", body)).status, 428);
      assert.equal((await request("/shopping", body, "not-a-uuid")).status, 400);
      assert.equal((await request("/shopping", { items: null }, randomUUID())).status, 400);
      const requestKey = randomUUID();
      const response = await request("/shopping", body, requestKey);
      assert.equal(response.status, 202);
      const delivery = await response.json() as { id: string; status: string; recipient: string; error: unknown };
      assert.deepEqual(Object.keys(delivery).sort(), ["error", "id", "recipient", "status"]);
      assert.equal(delivery.status, "queued");
      assert.equal(delivery.recipient, "first@example.com");
      await a.query("UPDATE users SET email='changed@example.com' WHERE id=1");
      assert.deepEqual(await (await request("/shopping", body, requestKey)).json(), delivery);
      assert.equal((await request("/shopping", { ...body, extraItems: ["different"] }, requestKey)).status, 409);
      assert.equal((await request(`/deliveries/${delivery.id}`, undefined, undefined, 2)).status, 404);
      assert.equal((await request(`/deliveries/${delivery.id}/retry`, {}, undefined, 2)).status, 404);
      assert.equal((await request(`/deliveries/${delivery.id}/retry`, {})).status, 409);
      assert.equal((await (await request("/deliveries")).json() as unknown[]).length, 20);
      assert.deepEqual(await (await request(`/deliveries/${delivery.id}`)).json(), delivery);
      await a.query("UPDATE email_deliveries SET status='failed' WHERE id=$1", [delivery.id]);
      const retryResponse = await request(`/deliveries/${delivery.id}/retry`, {});
      assert.equal(retryResponse.status, 202);
      assert.equal((await retryResponse.json() as { id: string }).id, delivery.id);
      const menuResponse = await request("/menu", { days: [{ day: "Lunes", lunch: { primero2: { name: "Extra" } }, dinner: {} }] }, randomUUID());
      assert.equal(menuResponse.status, 202);
      const menuId = (await menuResponse.json() as { id: string }).id;
      const persisted = (await a.query("SELECT snapshot FROM email_deliveries WHERE id=$1", [menuId])).rows[0].snapshot;
      assert.ok(persisted.attachments[0].contentInBase64.length > 100);
      assert.match(persisted.content.html, /Extra/);
    } finally {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    await a.query("SET search_path TO public");
    await b.query("SET search_path TO public");
    await a.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    a.release(); b.release();
    await pool.end();
  }
});
