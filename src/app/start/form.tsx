"use client";

import { useActionState, useState, type ReactNode } from "react";
import { createShop } from "./actions";
import { SHOP_KINDS, type ShopKind } from "./options";

const SAMPLE_NOTE: Record<ShopKind, string> = {
  ceramics: "A cup set, a mug and a serving bowl",
  prints: "Three art prints",
  jewelry: "Earrings, a necklace and a ring",
  candles: "Three of Maya's candles",
  other: "",
};

const input =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-cream placeholder:text-smoke/60 outline-none transition focus:border-ember/70 focus:ring-2 focus:ring-ember/20";

export function StartForm() {
  const [state, action, pending] = useActionState(createShop, null);
  const err = (k: string) => state?.errors?.[k];
  const v = (k: string) => state?.values?.[k];
  const [kind, setKind] = useState<ShopKind>((v("kind") as ShopKind) || "ceramics");

  return (
    <form action={action} className="space-y-7">
      <Section title="Your shop">
        <Field id="name" label="Shop name" error={err("name")}>
          <input id="name" name="name" defaultValue={v("name")} required maxLength={40} placeholder="Juniper Ceramics" className={input} autoFocus />
        </Field>
        <div role="radiogroup" aria-label="What do you sell?">
          <p className="mb-1.5 text-sm font-medium text-cream">What do you sell?</p>
          <div className="flex flex-wrap gap-2">
            {SHOP_KINDS.map((k) => (
              <label key={k.id} className="cursor-pointer">
                <input
                  type="radio"
                  name="kind"
                  value={k.id}
                  checked={kind === k.id}
                  onChange={() => setKind(k.id)}
                  className="peer sr-only"
                />
                <span className="inline-block rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-smoke transition peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10 peer-checked:text-cream peer-focus-visible:ring-2 peer-focus-visible:ring-ember/40 hover:border-white/25">
                  {k.label}
                </span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="ownerName" label="Your first name" error={err("ownerName")}>
            <input id="ownerName" name="ownerName" defaultValue={v("ownerName")} required maxLength={40} placeholder="Sam" className={input} />
          </Field>
          <Field id="shipsFrom" label="Ships from" error={err("shipsFrom")}>
            <input id="shipsFrom" name="shipsFrom" defaultValue={v("shipsFrom")} required maxLength={60} placeholder="Austin, Texas, USA" className={input} />
          </Field>
        </div>
        <Field id="tagline" label="One-line description" hint="Optional" error={err("tagline")}>
          <input id="tagline" name="tagline" defaultValue={v("tagline")} maxLength={90} placeholder="Small-batch stoneware, thrown by hand" className={input} />
        </Field>
      </Section>

      <Section title="Facts AI assistants will quote" note="Assistants answer buyers from exactly these, so they never guess.">
        <Choice name="shipsTo" value={v("shipsTo")} label="Ships to" error={err("shipsTo")} options={[["us", "US only"], ["us-ca", "US & Canada"], ["us-ca-uk-au", "US, Canada, UK & Australia"]]} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Choice name="processing" value={v("processing")} label="Ships within" options={[["1-2", "1–2 days"], ["3-5", "3–5 days"]]} />
          <Choice name="shipping" value={v("shipping")} label="Shipping" options={[["flat", "$5.95 flat"], ["free", "Free"]]} />
        </div>
        <Choice name="returns" value={v("returns")} label="Returns" options={[["30", "30 days"], ["14", "14 days"], ["none", "No returns"]]} />
        <Field id="materials" label="What it's made of" error={err("materials")}>
          <input id="materials" name="materials" defaultValue={v("materials")} required maxLength={160} placeholder="Stoneware clay, lead-free glazes, dishwasher safe" className={input} />
        </Field>
      </Section>

      <Section title="Sign-in">
        <Field id="password" label="Choose a password" hint="At least 8 characters" error={err("password")}>
          <input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className={input} />
        </Field>
        {kind === "other" ? (
          <p className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5 text-sm text-smoke">
            Your shop starts empty. Add products from photos right after: AI drafts each listing for you.
          </p>
        ) : (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <input type="checkbox" name="samples" defaultChecked={v("samples") !== "off"} className="mt-0.5 size-4 accent-amber-500" />
            <span className="text-sm">
              <span className="text-cream">Start with 3 sample products</span>
              <span className="block text-smoke">
                {SAMPLE_NOTE[kind]}, with photos, so you can try an AI purchase right away. Add your own any time.
              </span>
            </span>
          </label>
        )}
      </Section>

      {state?.message && (
        <p role="alert" className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {state.message}
        </p>
      )}
      <button
        disabled={pending}
        className="w-full rounded-full bg-amber-500 px-5 py-3 text-sm font-semibold text-wax transition-colors hover:bg-amber-400 disabled:opacity-60"
      >
        {pending ? "Opening your shop…" : "Create my shop"}
      </button>
      <p className="text-xs leading-relaxed text-smoke">
        Demo shops run in the PayPal sandbox: no real money moves, and payments go to AgentShelf&apos;s sandbox business
        account. Your shop and everything in it is deleted after 30 days.
      </p>
    </form>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-3">
        <span className="text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">{title}</span>
        {note && <span className="mt-1 block text-sm text-smoke">{note}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-cream">
        {label}
        {hint && <span className="text-xs font-normal text-smoke">{hint}</span>}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}

function Choice({
  name,
  label,
  options,
  value,
  error,
}: {
  name: string;
  label: string;
  options: [string, string][];
  value?: string;
  error?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1.5 text-sm font-medium text-cream">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([optionValue, text], i) => (
          <label key={optionValue} className="cursor-pointer">
            <input type="radio" name={name} value={optionValue} defaultChecked={value ? value === optionValue : i === 0} className="peer sr-only" />
            <span className="inline-block rounded-full border border-white/10 px-3.5 py-1.5 text-sm text-smoke transition peer-checked:border-amber-500/60 peer-checked:bg-amber-500/10 peer-checked:text-cream peer-focus-visible:ring-2 peer-focus-visible:ring-ember/40 hover:border-white/25">
              {text}
            </span>
          </label>
        ))}
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  );
}
