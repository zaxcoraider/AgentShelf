import "server-only";
import { and, eq, gt, inArray, or, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { db, schema } from "./db";
import { createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "./session";

/** Shops this browser created or signed into, newest first, so sign-in can offer them in a menu. */
const KNOWN_COOKIE = "agentshelf_shops";
const KNOWN_MAX = 6;

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
  const jar = await cookies();
  const cookie = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
  jar.set(SESSION_COOKIE, await createSessionToken(slug), { ...cookie, maxAge: SESSION_DAYS * 86_400 });
  const known = [slug, ...readKnown(jar.get(KNOWN_COOKIE)?.value).filter((s) => s !== slug)].slice(0, KNOWN_MAX);
  jar.set(KNOWN_COOKIE, known.join(","), { ...cookie, maxAge: 60 * 86_400 });
}

const readKnown = (value: string | undefined) => (value ?? "").split(",").filter((s) => /^[a-z0-9-]{1,60}$/.test(s));

/** The visitor shops this browser knows that still exist, newest first. Never lists anyone else's. */
export async function knownShops(): Promise<{ slug: string; name: string }[]> {
  const slugs = readKnown((await cookies()).get(KNOWN_COOKIE)?.value);
  if (!slugs.length) return [];
  const rows = await db.query.sellers.findMany({
    columns: { slug: true, name: true },
    where: and(
      inArray(schema.sellers.slug, slugs),
      eq(schema.sellers.visitor, true),
      or(isNull(schema.sellers.expiresAt), gt(schema.sellers.expiresAt, new Date())),
    ),
  });
  return slugs.flatMap((s) => rows.filter((r) => r.slug === s));
}
