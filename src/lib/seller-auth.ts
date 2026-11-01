import "server-only";
import { cookies } from "next/headers";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "./session";

/**
 * Server-only sign-in helpers. Deliberately NOT in a "use server" file: every export there is a
 * publicly callable server action, and startSession must only run after a password check.
 */

/** "Maya's Candles", "mayas-candles" or a pasted /shop/<slug> link all name the same shop. */
export function shopSlug(input: string) {
  const text = input.trim().toLowerCase();
  const fromUrl = text.match(/\/shop\/([a-z0-9-]+)/)?.[1];
  return fromUrl ?? text.replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Sign this browser in as the given shop. Call only after verifying the shop's password. */
export async function startSession(slug: string) {
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(slug), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}
