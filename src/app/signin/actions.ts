"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/lib/db";
import { verifyPassword } from "@/lib/passwords";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { shopSlug, startSession } from "@/lib/seller-auth";
import { checkPassword, SESSION_COOKIE } from "@/lib/session";

export type SignInState = { message: string } | null;

/** Only send people back to a seller page, never to another site. */
const safeNext = (next: unknown) => (typeof next === "string" && /^\/seller(\/|$|\?)/.test(next) ? next : "/seller/inbox");

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const slug = shopSlug(String(form.get("shop") ?? "")) || DEMO_SELLER_SLUG;
  const password = String(form.get("password") ?? "");
  const seller = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, slug) });

  const ok =
    seller &&
    !(seller.expiresAt && seller.expiresAt.getTime() < Date.now()) &&
    (seller.visitor ? await verifyPassword(password, seller.passwordHash) : await checkPassword(password));
  if (!ok) {
    // A short pause makes guessing slow without adding a rate-limit store.
    await new Promise((r) => setTimeout(r, 800));
    return { message: seller ? "That password isn't right." : "No shop with that name. Check the spelling, or create one." };
  }
  await startSession(seller.slug);
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
