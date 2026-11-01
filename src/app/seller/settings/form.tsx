"use client";

import { useActionState, type ReactNode } from "react";
import { updateSettings } from "./actions";

export type SettingsValues = {
  tagline: string;
  ownerName: string;
  shipsFrom: string;
  shipsTo: string;
  shipsToCurrent: string;
  processing: string;
  processingCurrent: string;
  shippingUsd: string;
  returns: string;
  materials: string;
  customOrders: string;
  refundLimitUsd: string;
  marketplace: boolean;
};

const input =
  "w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-cream outline-none transition placeholder:text-smoke/60 focus:border-ember/70 focus:ring-2 focus:ring-ember/20 disabled:opacity-60";

export function SettingsForm({ values, editable, dailyCap }: { values: SettingsValues; editable: boolean; dailyCap: string }) {
  const [state, action, pending] = useActionState(updateSettings, null);
  const err = (k: string) => state?.errors?.[k];

  const shipsTo: [string, string][] = [
    ["us", "US only"],
    ["us-ca", "US & Canada"],
    ["us-ca-uk-au", "US, Canada, UK & Australia"],
  ];
  if (values.shipsTo === "keep") shipsTo.unshift(["keep", values.shipsToCurrent]);
  const processing: [string, string][] = [
    ["1-2", "1–2 days"],
    ["3-5", "3–5 days"],
  ];
  if (values.processing === "keep") processing.unshift(["keep", values.processingCurrent]);
  const returns: [string, string][] = [
    ["30", "30 days"],
    ["14", "14 days"],
    ["0", "No returns"],
  ];
  if (!returns.some(([v]) => v === values.returns)) returns.unshift([values.returns, `${values.returns} days`]);

  return (
    <form action={action} className="space-y-8">
      <fieldset disabled={!editable} className="space-y-8">
        <Section title="Shop">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="ownerName" label="Your first name" error={err("ownerName")}>
              <input id="ownerName" name="ownerName" defaultValue={values.ownerName} maxLength={40} required className={input} />
            </Field>
            <Field id="shipsFrom" label="Ships from" error={err("shipsFrom")}>
              <input id="shipsFrom" name="shipsFrom" defaultValue={values.shipsFrom} maxLength={60} required className={input} />
            </Field>
          </div>
          <Field id="tagline" label="One-line description" hint="Optional" error={err("tagline")}>
            <input id="tagline" name="tagline" defaultValue={values.tagline} maxLength={90} className={input} />
          </Field>
        </Section>

        <Section title="Facts AI assistants quote">
          <Choice name="shipsTo" label="Ships to" value={values.shipsTo} options={shipsTo} error={err("shipsTo")} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice name="processing" label="Ships within" value={values.processing} options={processing} />
            <Field id="shippingUsd" label="Shipping per order" hint="0 = free" error={err("shippingUsd")}>
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-smoke">$</span>
                <input id="shippingUsd" name="shippingUsd" type="number" step="0.01" min="0" max="50" defaultValue={values.shippingUsd} required className={`${input} pl-7`} />
              </div>
            </Field>
          </div>
          <Choice name="returns" label="Returns" value={values.returns} options={returns} error={err("returns")} />
          <Field id="materials" label="What it's made of" error={err("materials")}>
            <input id="materials" name="materials" defaultValue={values.materials} maxLength={160} required className={input} />
          </Field>
          <Field id="customOrders" label="Custom orders" hint="Optional; empty = no custom orders" error={err("customOrders")}>
            <input id="customOrders" name="customOrders" defaultValue={values.customOrders} maxLength={160} placeholder="e.g. Engraving on request, 2 weeks" className={input} />
          </Field>
        </Section>

        <Section title="AI shoppers">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
            <input type="checkbox" name="marketplace" defaultChecked={values.marketplace} className="mt-0.5 size-4 accent-amber-500" />
            <span className="text-sm">
              <span className="text-cream">Show my shop in the AgentShelf marketplace</span>
              <span className="block text-smoke">
                One connector lets AI assistants search every AgentShelf shop at once, so shoppers can find you without adding
                your shop first. Your own shop connector works either way.
              </span>
            </span>
          </label>
        </Section>

        <Section title="Seller agent">
          <Field id="refundLimitUsd" label="Refund on its own up to" error={err("refundLimitUsd")}>
            <div className="relative max-w-48">
              <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-smoke">$</span>
              <input id="refundLimitUsd" name="refundLimitUsd" type="number" step="0.01" min="0" max="500" defaultValue={values.refundLimitUsd} required className={`${input} pl-7`} />
            </div>
          </Field>
          <p className="-mt-2 text-sm text-smoke">
            Refunds at or under this amount, the agent does by itself (up to {dailyCap} a day in total). Anything larger
            waits in your Inbox for you to approve. Set $0 to approve every refund yourself.
          </p>
        </Section>
      </fieldset>

      {editable && (
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className="rounded-full bg-amber-500 px-5 py-2.5 text-sm font-semibold text-wax transition-colors hover:bg-amber-400 disabled:opacity-60">
            {pending ? "Saving…" : "Save settings"}
          </button>
          {state && (
            <p role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-emerald-300" : "text-red-300"}`}>
              {state.message}
            </p>
          )}
        </div>
      )}
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">{title}</h2>
      {children}
    </section>
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

function Choice({ name, label, value, options, error }: { name: string; label: string; value: string; options: [string, string][]; error?: string }) {
  return (
    <div role="radiogroup" aria-label={label}>
      <p className="mb-1.5 text-sm font-medium text-cream">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, text]) => (
          <label key={v} className="cursor-pointer">
            <input type="radio" name={name} value={v} defaultChecked={v === value} className="peer sr-only" />
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
