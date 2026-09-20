import assert from "node:assert/strict";
import { test } from "node:test";
import { checkPublicApi, FRONTEND_ORIGIN } from "./check-public-api.mjs";

const apiUrl = "https://api.example.test";
const cors = { "access-control-allow-origin": FRONTEND_ORIGIN };
const fixtures = () => [
  Response.json({ status: "ok", db: true }, { headers: cors }),
  new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "access-control-allow-methods": "GET, POST",
      "access-control-allow-headers": "content-type",
    },
  }),
  Response.json({ error: "Email and password are required" }, { status: 400, headers: cors }),
];

function fakeFetch(responses, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    const response = responses.shift();
    assert.ok(response, "Unexpected extra request");
    return response;
  };
}

test("checks the API, CORS and login without sending credentials", async () => {
  const calls = [];
  await checkPublicApi(`${apiUrl}/`, fakeFetch(fixtures(), calls));
  assert.deepEqual(calls.map(call => [call.url, call.options.method ?? "GET"]), [
    [`${apiUrl}/api/healthz`, "GET"],
    [`${apiUrl}/api/users/login`, "OPTIONS"],
    [`${apiUrl}/api/users/login`, "POST"],
  ]);
  for (const { options } of calls) {
    assert.equal(options.headers.Origin, FRONTEND_ORIGIN);
    assert.equal(options.headers.Authorization, undefined);
    assert.equal(options.headers["X-User-Id"], undefined);
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
  }
  assert.equal(calls[2].options.body, "{}");
});

test("rejects missing or invalid configuration before making requests", async () => {
  for (const url of [undefined, "", "not-a-url", "http://api.example.test", `${apiUrl}/api`, `${apiUrl}?key=value`, `${apiUrl}#hash`, "https://user:password@api.example.test"]) {
    const calls = [];
    await assert.rejects(checkPublicApi(url, fakeFetch([], calls)));
    assert.equal(calls.length, 0);
  }
});

test("rejects an obsolete API that requires identification on public health", async () => {
  await assert.rejects(
    checkPublicApi(apiUrl, fakeFetch([Response.json({ error: "Missing X-User-Id header" }, { status: 401 })])),
    /health check failed: HTTP 401/,
  );
});

test("rejects an unhealthy database", async () => {
  const responses = fixtures();
  responses[0] = Response.json({ status: "ok", db: false }, { headers: cors });
  await assert.rejects(checkPublicApi(apiUrl, fakeFetch(responses)), /healthy database/);
});

test("rejects CORS failures on every public endpoint", async () => {
  for (let index = 0; index < 3; index++) {
    const responses = fixtures();
    responses[index].headers.delete("access-control-allow-origin");
    await assert.rejects(checkPublicApi(apiUrl, fakeFetch(responses)), /GitHub Pages origin/);
  }
});

test("rejects preflights that do not allow JSON POST requests", async () => {
  for (const header of ["access-control-allow-methods", "access-control-allow-headers"]) {
    const responses = fixtures();
    responses[1].headers.delete(header);
    await assert.rejects(checkPublicApi(apiUrl, fakeFetch(responses)), /JSON POST requests/);
  }
});

test("rejects login protected by session middleware before field validation", async () => {
  const responses = fixtures();
  responses[2] = Response.json({ error: "Missing X-User-Id header" }, { status: 401, headers: cors });
  await assert.rejects(checkPublicApi(apiUrl, fakeFetch(responses)), /without requiring a session: HTTP 401/);
});

test("rejects an unrelated 400 response and network failures", async () => {
  const responses = fixtures();
  responses[2] = Response.json({ error: "Wrong endpoint" }, { status: 400, headers: cors });
  await assert.rejects(checkPublicApi(apiUrl, fakeFetch(responses)), /expected public API contract/);
  await assert.rejects(checkPublicApi(apiUrl, async () => { throw new Error("Network unavailable"); }), /Network unavailable/);
});
