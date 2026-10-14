import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliverySchema, readPendingEmails, removePendingEmail,
  sameEmailRequest, savePendingEmail, type PendingEmail,
} from "./email-outbox";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const email = (): PendingEmail => ({
  id: "264fb849-3305-43cf-86c1-3ff7e3b9fc92",
  createdAt: "2026-09-13T18:00:00Z",
  request: { kind: "shopping", payload: { items: [{ ingredient: "Arroz", recipes: ["Paella"] }], extraItems: ["Pan"] } },
});

test("pending requests survive reload with the same id and complete snapshot", () => {
  const storage = new MemoryStorage();
  const original = email();
  savePendingEmail(storage, 8, original);
  assert.deepEqual(readPendingEmails(storage, 8), [original]);
  if (original.request.kind === "shopping") original.request.payload.extraItems?.push("Leche");
  assert.deepEqual(readPendingEmails(storage, 8), [email()]);
});

test("pending requests are scoped to their user and removing one does not touch another", () => {
  const storage = new MemoryStorage();
  savePendingEmail(storage, 8, email());
  savePendingEmail(storage, 9, email());
  removePendingEmail(storage, 8, email().id);
  assert.equal(readPendingEmails(storage, 8).length, 0);
  assert.deepEqual(readPendingEmails(storage, 9), [email()]);
});

test("transient failures and retries preserve the original id and payload", () => {
  const storage = new MemoryStorage();
  savePendingEmail(storage, 8, { ...email(), error: "Connection lost", blocked: false });
  const [saved] = readPendingEmails(storage, 8);
  assert.equal(saved.id, email().id);
  assert.deepEqual(saved.request, email().request);
  savePendingEmail(storage, 8, { ...saved, error: undefined });
  assert.equal(readPendingEmails(storage, 8)[0].id, email().id);
});

test("corrupt pending data fails visibly and is not discarded", () => {
  const storage = new MemoryStorage();
  storage.setItem("email-outbox:8:broken", "{");
  assert.throws(() => readPendingEmails(storage, 8));
  assert.equal(storage.getItem("email-outbox:8:broken"), "{");
});

test("a mismatched storage key is rejected", () => {
  const storage = new MemoryStorage();
  storage.setItem("email-outbox:8:wrong", JSON.stringify(email()));
  assert.throws(() => readPendingEmails(storage, 8), /Invalid email outbox key/);
});

test("quota errors propagate instead of pretending the snapshot was saved", () => {
  const storage = new MemoryStorage();
  storage.setItem = () => { throw new Error("Quota exceeded"); };
  assert.throws(() => savePendingEmail(storage, 8, email()), /Quota exceeded/);
});

test("duplicate pending requests match while changed content is distinct", () => {
  assert.ok(sameEmailRequest(email().request, email().request));
  assert.equal(sameEmailRequest(email().request, { kind: "shopping", payload: { items: [], extraItems: ["Leche"] } }), false);
});

test("a generic HTTP success is not interpreted as provider confirmation", () => {
  assert.equal(deliverySchema.safeParse({ ok: true }).success, false);
  assert.equal(deliverySchema.safeParse({ id: email().id, status: "queued", recipient: "test@example.com" }).success, true);
});
