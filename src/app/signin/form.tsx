"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export function SignInForm({ next, shop }: { next?: string; shop?: string }) {
  const [state, action, pending] = useActionState(signIn, null);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label htmlFor="shop" className="block text-sm font-medium">
        Shop
      </label>
      <input
        id="shop"
        name="shop"
        defaultValue={shop ?? "Maya's Candles"}
        required
        autoComplete="username"
        className="w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 outline-none transition focus:border-ember/70 focus:ring-2 focus:ring-ember/20 dark:border-white/10"
      />
      <label htmlFor="password" className="block pt-1 text-sm font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        required
        autoFocus
        autoComplete="current-password"
        className="w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 outline-none transition focus:border-ember/70 focus:ring-2 focus:ring-ember/20 dark:border-white/10"
      />
      {state && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-stone-700 disabled:opacity-50 dark:bg-cream dark:text-wax dark:hover:bg-white"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
