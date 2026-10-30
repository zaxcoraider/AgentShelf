/**
 * Demo sign-in for the seller side. One password (SELLER_DEMO_PASSWORD) unlocks the demo
 * seller; a signed cookie keeps them signed in. With no password set (local runs), the
 * seller pages stay open. Web Crypto only, so this also runs in middleware.
 */

export const SESSION_COOKIE = "agentshelf_seller";
export const SESSION_DAYS = 7;

const encoder = new TextEncoder();

export const sellerAuthEnabled = () => Boolean(process.env.SELLER_DEMO_PASSWORD);

function base64url(bytes: ArrayBuffer) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Compare without stopping at the first difference, so timing doesn't leak how much matched. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string) {
  // Keyed on the password, so changing it signs everyone out.
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`agentshelf-session:${process.env.SELLER_DEMO_PASSWORD}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64url(await crypto.subtle.sign("HMAC", key, encoder.encode(payload)));
}

export async function checkPassword(attempt: string) {
  const expected = process.env.SELLER_DEMO_PASSWORD;
  if (!expected) return false;
  const digest = async (text: string) => base64url(await crypto.subtle.digest("SHA-256", encoder.encode(text)));
  return sameText(await digest(attempt), await digest(expected));
}

export async function createSessionToken(sellerSlug: string) {
  const payload = `${sellerSlug}.${Date.now() + SESSION_DAYS * 86_400_000}`;
  return `${payload}.${await sign(payload)}`;
}

/** The seller slug a valid, unexpired token belongs to; null otherwise. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  const [slug, expires, signature] = token?.split(".") ?? [];
  if (!slug || !expires || !signature || Number(expires) < Date.now()) return null;
  return sameText(signature, await sign(`${slug}.${expires}`)) ? slug : null;
}
