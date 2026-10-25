import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { extractWhatsAppMessages, mergeWhatsAppIngredients, parseShoppingCommand, validMetaSignature, WHATSAPP_HELP } from "./whatsapp";
import { parseImageItems } from "./whatsapp-image";
import { processWhatsAppJob, type WhatsAppWorkerDependencies } from "./whatsapp-worker";

test("Spanish shopping commands preserve amounts and reject unsupported actions", () => {
  assert.deepEqual(parseShoppingCommand("Añade leche, huevos y pan"), { kind: "list", ingredients: ["leche", "huevos", "pan"] });
  assert.deepEqual(parseShoppingCommand("añade a la lista de la compra 1,5 litros de leche; pan."), {
    kind: "list", ingredients: ["1,5 litros de leche", "pan"],
  });
  assert.deepEqual(parseShoppingCommand("apunta tomates a la lista de la compra"), { kind: "list", ingredients: ["tomates"] });
  assert.deepEqual(parseShoppingCommand("lista: arroz\naceite"), { kind: "list", ingredients: ["arroz", "aceite"] });
  for (const message of ["", "hola", "no añadas leche", "mercadona: pan", "compra y paga pan", "añade ", `añade ${"a".repeat(121)}`, `lista: ${Array(21).fill("pan").join(", ")}`]) {
    assert.deepEqual(parseShoppingCommand(message), { kind: "help" });
  }
  assert.deepEqual(parseShoppingCommand(`vincular ${"A".repeat(32)}`), { kind: "link", code: "a".repeat(32) });
});

test("merges into recipe items without duplicates or changing recipe attribution", () => {
  const original = [{ ingredient: "Leche", recipes: ["Crema"], mercadonaProducts: [] }];
  const items = mergeWhatsAppIngredients(original, [{ ingredient: " leche " }, { ingredient: "Pan" }, { ingredient: "pan" }]);
  assert.deepEqual(items, [
    { ingredient: "Leche", recipes: ["Crema", "WhatsApp"], mercadonaProducts: [] },
    { ingredient: "Pan", recipes: ["WhatsApp"], mercadonaProducts: [] },
  ]);
  assert.deepEqual(original[0].recipes, ["Crema"]);
  assert.equal(mergeWhatsAppIngredients([], [{ ingredient: "Limón" }, { ingredient: "Limo\u0301n" }]).length, 1);
});

test("signature checks exact bytes and safely rejects malformed signatures", () => {
  const body = Buffer.from('{"text":"añade leche"}');
  const signature = `sha256=${createHmac("sha256", "test-secret").update(body).digest("hex")}`;
  assert.equal(validMetaSignature(body, signature, "test-secret"), true);
  assert.equal(validMetaSignature(Buffer.concat([body, Buffer.from(" ")]), signature, "test-secret"), false);
  for (const bad of [undefined, "", "sha256=bad", `sha256=${"0".repeat(64)}`]) {
    assert.equal(validMetaSignature(body, bad, "test-secret"), false);
  }
  assert.equal(validMetaSignature(body, signature, ""), false);
});

test("extracts all text messages and list photos for only the configured business number", () => {
  const messages = [
    { id: "m1", from: "34600000001", type: "text", text: { body: "añade pan" } },
    { id: "m2", from: "34600000001", type: "audio" },
    { id: "m3", from: "34600000001", type: "image", image: { id: "1234567890", mime_type: "image/jpeg", caption: "añade sal" } },
    { id: "m4", from: "34600000001", type: "image", image: { id: "../../me" } },
  ];
  const change = { field: "messages", value: { metadata: { phone_number_id: "123" }, messages } };
  assert.deepEqual(extractWhatsAppMessages({ object: "whatsapp_business_account", entry: [{ changes: [change] }] }, "123"), [
    { id: "m1", phone: "34600000001", text: "añade pan" }, { id: "m2", phone: "34600000001", text: "" },
    { id: "m3", phone: "34600000001", text: "añade sal", mediaId: "1234567890" }, { id: "m4", phone: "34600000001", text: "" },
  ]);
  assert.deepEqual(extractWhatsAppMessages({ object: "whatsapp_business_account", entry: [{ changes: [change] }] }, "999"), []);
  assert.deepEqual(extractWhatsAppMessages({ entry: [] }, "123"), []);
  assert.deepEqual(extractWhatsAppMessages(null, "123"), []);
});

test("reply retries do not re-run ingredient writes", async () => {
  const events: string[] = [];
  const deps: WhatsAppWorkerDependencies = {
    claim: async () => ({ id: "m1", phone: "34600000001", body: "", reply: "Añadido: pan", attempts: 2 }),
    process: async () => { throw new Error("Must not process twice"); },
    send: async (_phone, reply) => { events.push(reply); },
    delivered: async id => { events.push(id); },
  };
  assert.equal(await processWhatsAppJob(deps), true);
  assert.deepEqual(events, ["Añadido: pan", "m1"]);
  await assert.rejects(processWhatsAppJob({ ...deps, send: async () => { throw new Error("provider down"); } }), /provider down/);
  assert.deepEqual(events, ["Añadido: pan", "m1"]);
  assert.equal(await processWhatsAppJob({ ...deps, claim: async () => undefined }), false);
});

test("photo readings become clean shopping list lines", () => {
  assert.deepEqual(parseImageItems(JSON.stringify({ items: ["- leche entera x2", "• Huevos", "1. pan de molde", "huevos", "", 7, "x".repeat(121), "  2 kg  tomates "] })),
    ["leche entera x2", "Huevos", "pan de molde", "2 kg tomates"]);
  assert.deepEqual(parseImageItems(JSON.stringify({ items: Array.from({ length: 50 }, (_, index) => `producto ${index}`) })).length, 40);
  for (const bad of ["", "no json", "{}", JSON.stringify({ items: "leche" }), "null"]) assert.deepEqual(parseImageItems(bad), []);
  assert.match(WHATSAPP_HELP, /foto de tu lista/);
  assert.match(WHATSAPP_HELP, /no se modifica el carrito/);
});
