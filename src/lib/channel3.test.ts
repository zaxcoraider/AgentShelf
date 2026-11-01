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
  // Closest to the median first.
  assert.deepEqual(
    m.comparables.map((c) => c.priceUsd),
    [32, 24, 40],
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

import { createHmac } from "node:crypto";
import { verifyChannel3Webhook } from "./channel3";

const secret = `whsec_${Buffer.from("test-signing-key-123").toString("base64")}`;
function signed(body: string, opts: { at?: number; key?: string } = {}) {
  const id = "msg_1";
  const ts = String(opts.at ?? Math.floor(Date.now() / 1000));
  const sig = createHmac("sha256", Buffer.from((opts.key ?? secret).replace(/^whsec_/, ""), "base64"))
    .update(`${id}.${ts}.${body}`)
    .digest("base64");
  return new Headers({ "svix-id": id, "svix-timestamp": ts, "svix-signature": `v1,${sig}` });
}

test("accepts a correctly signed Channel3 webhook", async () => {
  const body = '{"id":"e1","type":"offer.price.changed"}';
  assert.equal(await verifyChannel3Webhook(signed(body), body, secret), true);
});

test("rejects a tampered body, a stale timestamp, or the wrong secret", async () => {
  const body = '{"id":"e1","type":"offer.price.changed"}';
  assert.equal(await verifyChannel3Webhook(signed(body), body.replace("e1", "e2"), secret), false);
  assert.equal(await verifyChannel3Webhook(signed(body, { at: Math.floor(Date.now() / 1000) - 600 }), body, secret), false);
  const other = `whsec_${Buffer.from("another-key").toString("base64")}`;
  assert.equal(await verifyChannel3Webhook(signed(body, { key: other }), body, secret), false);
  assert.equal(await verifyChannel3Webhook(signed(body), body, undefined), false);
});
