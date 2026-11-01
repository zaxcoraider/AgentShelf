import Link from "next/link";
import { SHIP_TO } from "@/app/start/options";
import { DAILY_AUTO_REFUND_CAP_CENTS } from "@/lib/agent/guardrails";
import { usd } from "@/lib/money";
import { policyLines } from "@/lib/shop-facts";
import { canEditShop, requireSeller } from "@/lib/seller-session";
import { SettingsForm, type SettingsValues } from "./form";

// Shop settings: the facts AI assistants quote, and the seller agent's refund limit.
export const dynamic = "force-dynamic";

export default async function Settings() {
  const seller = await requireSeller();
  const p = seller.shopPolicy;
  const shipsToKey = p
    ? (Object.entries(SHIP_TO).find(([, codes]) => codes.join() === p.shipsTo.join())?.[0] ?? "keep")
    : "us";
  const processingKey = !p ? "1-2" : p.processingDays.min === 1 && p.processingDays.max === 2 ? "1-2" : p.processingDays.min === 3 && p.processingDays.max === 5 ? "3-5" : "keep";

  const values: SettingsValues = {
    tagline: seller.tagline ?? "",
    ownerName: seller.ownerName ?? "",
    shipsFrom: p?.shipsFrom ?? "",
    shipsTo: shipsToKey,
    shipsToCurrent: p?.shipsTo.join(", ") ?? "",
    processing: processingKey,
    processingCurrent: p ? `${p.processingDays.min}–${p.processingDays.max} days` : "",
    shippingUsd: p ? (p.shippingCents / 100).toFixed(2) : "5.95",
    returns: String(p?.returnsDays ?? 30),
    materials: p?.materials ?? "",
    customOrders: p?.customOrders ?? "",
    refundLimitUsd: (seller.refundAutoLimitCents / 100).toFixed(2),
    marketplace: seller.marketplace,
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1 text-sm text-smoke">
        The facts AI assistants quote to shoppers, and the rules your seller agent follows.
      </p>

      {!canEditShop(seller) && (
        <p className="mt-6 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-100/90">
          The demo shop is read-only so every judge sees the same demo.{" "}
          <Link href="/start" className="text-amber-300 underline-offset-2 hover:underline">
            Create your own shop
          </Link>{" "}
          to try changing these.
        </p>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_17rem]">
        <SettingsForm values={values} editable={canEditShop(seller)} dailyCap={usd(DAILY_AUTO_REFUND_CAP_CENTS)} />
        <aside className="h-fit rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 text-sm lg:sticky lg:top-20">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">What assistants say now</p>
          <ul className="mt-3 space-y-2 text-smoke">
            {policyLines(seller).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <Link href="/seller/ai-view" className="mt-4 inline-block text-amber-300 hover:text-amber-200">
            Test it in AI&apos;s view →
          </Link>
        </aside>
      </div>
    </main>
  );
}
