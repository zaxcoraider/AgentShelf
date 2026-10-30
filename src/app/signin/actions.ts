"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_DAYS } from "@/lib/session";

export type SignInState = { message: string } | null;

/** Only send people back to a seller page, never to another site. */
const safeNext = (next: unknown) => (typeof next === "string" && /^\/seller(\/|$|\?)/.test(next) ? next : "/seller/inbox");

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  if (!(await checkPassword(String(form.get("password") ?? "")))) {
    // A short pause makes guessing slow without adding a rate-limit store.
    await new Promise((r) => setTimeout(r, 800));
    return { message: "That password isn't right." };
  }
  (await cookies()).set(SESSION_COOKIE, await createSessionToken(DEMO_SELLER_SLUG), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
