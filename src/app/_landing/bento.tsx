import { usd } from "@/lib/money";

export type Activity = { id: string; label: string; status: string; reason: string; when: string };

type Props = {
  activity: Activity[];
  refundLimitCents: number;
  listing: { title: string; price: string; imageUrl: string } | null;
  checkout: { title: string; price: string };
  tools: string[];
};

const STATUS: Record<string, { text: string; className: string }> = {
  auto: { text: "Done", className: "text-emerald-300 bg-emerald-400/10" },
  approved: { text: "Approved", className: "text-emerald-300 bg-emerald-400/10" },
  pending_approval: { text: "Needs you", className: "text-flame bg-ember/10" },
  rejected: { text: "Declined", className: "text-smoke bg-white/5" },
  blocked: { text: "Blocked", className: "text-red-300 bg-red-400/10" },
  failed: { text: "Failed", className: "text-red-300 bg-red-400/10" },
};

const tile = "relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.04] to-white/[0.01] p-6";

/** The product, shown working: each tile pairs one capability with a live preview from the demo shop. */
export function Bento({ activity, refundLimitCents, listing, checkout, tools }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <article className={`${tile} md:col-span-4`}>
        <TileText title="An agent that works the after-sale">
          Tracking, refunds, and dispute reviews happen on their own, each with a reason you can read.
        </TileText>
        <ul className="mt-6 divide-y divide-white/[0.06] rounded-xl border border-white/[0.07] bg-wax/60">
          {activity.map((a) => {
            const status = STATUS[a.status] ?? STATUS.auto;
            return (
              <li key={a.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                <span className={`mt-0.5 w-20 shrink-0 rounded-md py-0.5 text-center text-xs font-medium ${status.className}`}>
                  {status.text}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-cream">{a.label}</p>
                  <p className="line-clamp-2 text-smoke sm:line-clamp-1">{a.reason}</p>
                </div>
                <span className="ml-auto shrink-0 text-xs text-smoke/70">{a.when}</span>
              </li>
            );
          })}
        </ul>
      </article>

      <article className={`${tile} md:col-span-2`}>
        <TileText title="Rules you set">Small refunds run on their own. Anything bigger waits for your click.</TileText>
        <div className="mt-8">
          <div className="flex justify-between text-xs text-smoke">
            <span>$0</span>
            <span className="text-flame">Auto up to {usd(refundLimitCents)}</span>
            <span>{usd(refundLimitCents * 2)}</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <div className="w-1/2 rounded-full bg-gradient-to-r from-ember/60 to-ember" />
          </div>
          <ul className="mt-6 space-y-2 text-sm text-smoke">
            <li className="flex gap-2">
              <span className="text-emerald-300">✓</span> Daily cap on automatic refunds
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-300">✓</span> Never on disputed orders
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-300">✓</span> Never turns a buyer down
            </li>
          </ul>
        </div>
      </article>

      <article className={`${tile} md:col-span-2`}>
        <TileText title="Photo to listing">Drop in a photo. AI writes the listing and suggests a price.</TileText>
        {listing && (
          <div className="mt-6 overflow-hidden rounded-xl border border-white/[0.07] bg-wax/60">
            {/* eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route */}
            <img src={listing.imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
            <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <p className="truncate font-medium">{listing.title}</p>
              <span className="shrink-0 text-flame">{listing.price}</span>
            </div>
          </div>
        )}
      </article>

      <article className={`${tile} md:col-span-2`}>
        <TileText title="PayPal checkout, buyer approved">
          The assistant creates the order. The buyer approves every payment in PayPal.
        </TileText>
        <div className="mt-6 rounded-xl border border-white/[0.07] bg-wax/60 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-smoke">PayPal order</span>
            <span className="rounded-md bg-ember/10 px-2 py-0.5 text-xs font-medium text-flame">Awaiting buyer</span>
          </div>
          <p className="mt-3 truncate font-medium">{checkout.title}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{checkout.price}</p>
          <div className="mt-4 rounded-full bg-[#ffc439] py-1.5 text-center text-xs font-semibold text-[#142c8e]">
            Pay with PayPal
          </div>
        </div>
      </article>

      <article className={`${tile} md:col-span-2`}>
        <TileText title="One URL for every assistant">
          Each shop gets its own MCP server with tools any assistant can call.
        </TileText>
        <ul className="mt-6 flex flex-wrap gap-2">
          {tools.map((t) => (
            <li key={t} className="rounded-md border border-white/[0.07] bg-wax/60 px-2.5 py-1 font-mono text-xs text-cream/90">
              {t}
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function TileText({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <h3 className="font-medium text-cream">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-smoke">{children}</p>
    </>
  );
}
