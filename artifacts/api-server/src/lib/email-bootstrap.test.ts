import assert from "node:assert/strict";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { bootstrapRetryDelay, startEmailBootstrap, type BootstrapEvent } from "./email-bootstrap";

function fakeScheduler() {
  const pending: { callback: () => void; delayMs: number; cancelled: boolean }[] = [];
  return {
    pending,
    schedule(callback: () => void, delayMs: number) {
      const timer = { callback, delayMs, cancelled: false };
      pending.push(timer);
      return () => { timer.cancelled = true; };
    },
    async advance() {
      const timer = pending.shift();
      assert.ok(timer, "expected scheduled retry");
      if (!timer.cancelled) timer.callback();
      await setImmediate();
      return timer;
    },
  };
}

test("bootstrap retries temporary DB and outbox failures, then starts one worker before seeding", async () => {
  const clock = fakeScheduler();
  const calls: string[] = [];
  const events: BootstrapEvent[] = [];
  let migrationAttempts = 0;
  let outboxAttempts = 0;
  const stop = startEmailBootstrap({
    async migrate() {
      calls.push("migrate");
      if (++migrationAttempts === 1) throw new Error("DB temporarily offline");
    },
    async initializeOutbox() {
      calls.push("outbox");
      if (++outboxAttempts === 1) throw new Error("temporary migration error");
    },
    startWorker() { calls.push("worker"); return () => calls.push("stop-worker"); },
    async seed() { calls.push("seed"); throw new Error("seed failure"); },
    log: event => events.push(event),
    schedule: clock.schedule,
  });
  await setImmediate();
  assert.deepEqual(calls, ["migrate"]);
  assert.equal(clock.pending[0]!.delayMs, 2000);
  await clock.advance();
  assert.deepEqual(calls, ["migrate", "migrate", "outbox"]);
  assert.equal(clock.pending[0]!.delayMs, 4000);
  await clock.advance();
  assert.deepEqual(calls, ["migrate", "migrate", "outbox", "migrate", "outbox", "worker", "seed"]);
  assert.equal(clock.pending.length, 0);
  assert.equal(events.filter(event => event.event === "worker-started").length, 1);
  assert.equal(events.at(-1)!.event, "seed-failed");
  stop();
  stop();
  assert.equal(calls.filter(call => call === "stop-worker").length, 1);
});

test("bootstrap backoff is capped and shutdown cancels pending retry", async () => {
  const clock = fakeScheduler();
  let attempts = 0;
  const stop = startEmailBootstrap({
    async migrate() { attempts++; throw new Error("offline"); },
    async initializeOutbox() { assert.fail("cannot initialize before DB migration"); },
    startWorker() { assert.fail("cannot start before readiness"); },
    async seed() { assert.fail("cannot seed before readiness"); },
    log() {},
    schedule: clock.schedule,
  });
  await setImmediate();
  for (let i = 0; i < 8; i++) await clock.advance();
  assert.equal(clock.pending[0]!.delayMs, 60_000);
  assert.equal(bootstrapRetryDelay(10_000), 60_000);
  stop();
  const before = attempts;
  assert.equal((await clock.advance()).cancelled, true);
  assert.equal(attempts, before);
});

for (const phase of ["migrate", "outbox"] as const) {
  test(`shutdown during ${phase} prevents late completion from starting a worker`, async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let outboxCalls = 0;
    const stop = startEmailBootstrap({
      async migrate() { if (phase === "migrate") await pending; },
      async initializeOutbox() { outboxCalls++; if (phase === "outbox") await pending; },
      startWorker() { assert.fail("must not start after shutdown"); },
      async seed() { assert.fail("must not seed after shutdown"); },
      log() {},
    });
    await setImmediate();
    stop();
    release();
    await setImmediate();
    assert.equal(outboxCalls, phase === "outbox" ? 1 : 0);
  });
}

test("shutdown stops the worker during independent seed work", async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let stopped = 0;
  let seedObservedShutdown = false;
  const events: BootstrapEvent[] = [];
  const stop = startEmailBootstrap({
    async migrate() {},
    async initializeOutbox() {},
    startWorker() { return () => { stopped++; }; },
    async seed(isStopped) { await pending; seedObservedShutdown = isStopped(); },
    log: event => events.push(event),
  });
  await setImmediate();
  stop();
  release();
  await setImmediate();
  assert.equal(stopped, 1);
  assert.equal(seedObservedShutdown, true);
  assert.equal(events.filter(event => event.event === "seed-completed").length, 0);
});
