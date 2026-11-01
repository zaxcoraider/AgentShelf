import assert from "node:assert/strict";
import { test } from "node:test";
import { summarize } from "./channel3";

const product = (title: string, ...offers: [number, string][]) => ({
  id: title,
  title,
  offers: offers.map(([price, currency], i) => ({ url: `https://s${i}.example/${title}`, domain: `s${i}.example`, price: { price, currency } })),
});

test("uses each product's cheapest USD offer and ignores other currencies", () => {
  const m = summarize([product("a", [30, "USD"], [24, "USD"], [5, "EUR"]), product("b", [40, "USD"]), product("c", [32, "USD"])]);
  assert.ok(m);
  assert.deepEqual(
    m.comparables.map((c) => c.priceUsd),
    [24, 40, 32],
  );
  assert.equal(m.lowUsd, 24);
  assert.equal(m.highUsd, 40);
  assert.equal(m.medianUsd, 32);
});

test("needs at least three priced matches", () => {
  assert.equal(summarize([product("a", [10, "USD"]), product("b", [12, "USD"]), product("c", [9, "GBP"])]), null);
});

test("trims one outlier at each end once there are six or more", () => {
  const m = summarize([5, 20, 22, 24, 26, 400].map((p, i) => product(`p${i}`, [p, "USD"])));
  assert.ok(m);
  assert.equal(m.lowUsd, 20);
  assert.equal(m.highUsd, 26);
  assert.equal(m.medianUsd, 23);
});
