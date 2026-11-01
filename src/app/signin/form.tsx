"use client";

import { useActionState, useState } from "react";
import { DEMO_SELLER_SLUG } from "@/lib/seller-slug";
import { signIn } from "./actions";

const OTHER = "__other";
const field =
  "w-full rounded-lg border border-stone-300 bg-transparent px-3 py-2 outline-none transition focus:border-ember/70 focus:ring-2 focus:ring-ember/20 dark:border-white/10";

export function SignInForm({ next, shop, known = [] }: { next?: string; shop?: string; known?: { slug: string; name: string }[] }) {
  const [state, action, pending] = useActionState(signIn, null);
  const listed = [DEMO_SELLER_SLUG, ...known.map((k) => k.slug)];
  // Open on the shop named in the link, else the shop this browser used last, else the demo shop.
  const initial = shop ? (listed.includes(shop) ? shop : OTHER) : (known[0]?.slug ?? DEMO_SELLER_SLUG);
  const [choice, setChoice] = useState(initial);
  return (
    <form action={action} className="mt-6 space-y-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label htmlFor="shop-choice" className="block text-sm font-medium">
        Shop
      </label>
      <div className="relative">
        <select
          id="shop-choice"
          name={choice === OTHER ? undefined : "shop"}
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          className={`${field} appearance-none pr-9 [&>*]:bg-wax [&>*]:text-cream`}
        >
          <option value={DEMO_SELLER_SLUG}>Maya&apos;s Candles (demo shop)</option>
          {known.length > 0 && (
            <optgroup label="Your shops on this browser">
              {known.map((k) => (
                <option key={k.slug} value={k.slug}>
                  {k.name}
                </option>
              ))}
            </optgroup>
          )}
          <option value={OTHER}>Another shop…</option>
        </select>
        <svg aria-hidden viewBox="0 0 20 20" fill="currentColor" className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 opacity-60">
          <path d="M5.5 7.5 10 12l4.5-4.5 1 1L10 14 4.5 8.5z" />
        </svg>
      </div>
      {choice === OTHER && (
        <input
          id="shop"
          name="shop"
          defaultValue={shop && !listed.includes(shop) ? shop : ""}
          required
          autoFocus
          placeholder="Shop name, e.g. Juniper Clay Studio"
          autoComplete="username"
          className={field}
        />
      )}
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
