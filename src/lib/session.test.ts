import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { createSessionToken, verifySessionToken } from "./session";

process.env.SELLER_DEMO_PASSWORD = "shared-with-judges";
process.env.PAYPAL_CLIENT_SECRET = "never-shared";
delete process.env.SESSION_SECRET;

const shop = { slug: "juniper-clay-studio", id: "3f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7c" };
const b64url = (buf: Buffer) => buf.toString("base64url");

test("a fresh token verifies to its shop", async () => {
  assert.deepEqual(await verifySessionToken(await createSessionToken(shop)), shop);
});

test("a token forged with the demo password is refused", async () => {
  const payload = `${shop.slug}.${shop.id}.${Date.now() + 86_400_000}`;
  const sig = createHmac("sha256", `agentshelf-session:${process.env.SELLER_DEMO_PASSWORD}`).update(payload).digest();
  assert.equal(await verifySessionToken(`${payload}.${b64url(sig)}`), null);
});

test("swapping in another shop's id or slug breaks the signature", async () => {
  const [slug, , expires, sig] = (await createSessionToken(shop)).split(".");
  assert.equal(await verifySessionToken(`${slug}.00000000-0000-0000-0000-000000000000.${expires}.${sig}`), null);
  assert.equal(await verifySessionToken(`mayas-candles.${shop.id}.${expires}.${sig}`), null);
});

test("old three-part tokens, expired and malformed tokens are refused", async () => {
  const [slug, , , sig] = (await createSessionToken(shop)).split(".");
  assert.equal(await verifySessionToken(`${slug}.${Date.now() + 86_400_000}.${sig}`), null);
  assert.equal(await verifySessionToken(undefined), null);
  assert.equal(await verifySessionToken("garbage"), null);
  const payload = `${shop.slug}.${shop.id}.${Date.now() - 1000}`;
  const [, , , realSig] = (await createSessionToken(shop)).split(".");
  assert.equal(await verifySessionToken(`${payload}.${realSig}`), null);
});
