/**
 * Seller sign-in. SELLER_DEMO_PASSWORD unlocks the showcase shop (Maya's); visitor shops made on
 * /start have their own password (src/lib/passwords.ts). A signed cookie names the shop.
 * With no demo password set (local runs), seller pages stay open and default to the showcase
 * shop. Web Crypto only, so this also runs in middleware.
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

/**
 * What session cookies are signed with: SESSION_SECRET if set, else the demo password (so
 * changing it signs everyone out). Locally, with neither set, a fixed dev key, so visitor
 * shops created on a laptop can still sign in.
 */
function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.SELLER_DEMO_PASSWORD || "agentshelf-local-dev-only";
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`agentshelf-session:${sessionSecret()}`),
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
