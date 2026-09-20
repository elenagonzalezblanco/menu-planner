import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSupermarketSearchUrl } from "./supermarkets.ts";

test("builds Mercadona search URLs with encoded ingredients", () => {
  assert.equal(
    buildSupermarketSearchUrl("mercadona", "aceite de oliva"),
    "https://tienda.mercadona.es/search-results?query=aceite%20de%20oliva",
  );
});

test("builds Carrefour search URLs with encoded ingredients", () => {
  assert.equal(
    buildSupermarketSearchUrl("carrefour", "limón y café"),
    "https://www.carrefour.es/supermercado?query=lim%C3%B3n%20y%20caf%C3%A9",
  );
});

for (const supermarket of ["mercadona", "carrefour"] as const) {
  test(`${supermarket} keeps special characters inside a single search term`, () => {
    const ingredient = "1/2 kg de piña & café + té #1? 50%";
    const url = new URL(buildSupermarketSearchUrl(supermarket, ingredient));
    assert.equal(url.protocol, "https:");
    assert.equal(url.searchParams.get("query"), ingredient);
    assert.deepEqual([...url.searchParams.keys()], ["query"]);
    assert.equal(url.hash, "");
  });
}
