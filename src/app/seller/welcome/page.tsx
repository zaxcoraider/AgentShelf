import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { requestBaseUrl } from "@/lib/base-url";
import { db, schema } from "@/lib/db";
import { requireSeller } from "@/lib/seller-session";
import { CopyButton } from "../connect/widgets";

// Where a new shop lands right after /start: its links, and the four steps to see AgentShelf work.
export const dynamic = "force-dynamic";

export default async function Welcome() {
  const seller = await requireSeller();
  const base = await requestBaseUrl();
  const storeUrl = `${base}/shop/${seller.slug}`;
  const mcpUrl = `${base}/api/mcp/${seller.slug}`;
  const [{ n: products }] = await db
    .select({ n: count() })
    .from(schema.products)
    .where(eq(schema.products.sellerId, seller.id));
  const daysLeft = seller.expiresAt ? Math.max(0, Math.ceil((seller.expiresAt.getTime() - Date.now()) / 86_400_000)) : null;

  const steps = [
    {
      title: products ? "See your storefront" : "Add your first product",
      body: products
        ? `${products} product${products === 1 ? " is" : "s are"} live, with PayPal checkout for human shoppers.`
        : "Drop in a photo and AI drafts the listing; publishing also adds it to the PayPal catalog.",
      href: products ? `/shop/${seller.slug}` : "/seller/listings",
      cta: products ? "Open storefront" : "Add a product",
    },
    {
      title: "Connect Claude or ChatGPT",
      body: "Add your shop's address as a connector. Assistants can then browse, answer questions and check out.",
      href: "/seller/connect",
      cta: "Setup steps",
    },
    {
      title: "Buy something through the AI",
      body: "Ask the assistant to buy a product and approve with the PayPal sandbox buyer (login in the Devpost submission).",
      href: "/seller/connect",
      cta: "Prompts to try",
    },
    {
      title: "Watch it land, then ask about it",
      body: "The order appears in your Inbox live. On the Dashboard, “Ask AI” explains your orders, refunds and disputes.",
      href: "/seller/inbox",
      cta: "Open Inbox",
    },
  ];

  return (
    <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-sm text-emerald-300">
        <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden />
        Your shop is open
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">Welcome, {seller.ownerName ?? "there"}.</h1>
      <p className="mt-3 max-w-xl text-lg text-smoke">
        {seller.name} can now sell to people and to AI assistants. Here&apos;s everything you need.
      </p>

      <section className="mt-10 grid gap-3">
        <LinkRow label="Storefront" value={storeUrl} href={`/shop/${seller.slug}`} />
        <LinkRow label="AI shop address (MCP)" value={mcpUrl} note="Paste into Claude or ChatGPT as a connector." />
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4 text-sm text-smoke">
          Sign in later with shop <span className="text-cream">{seller.name}</span> and your password.
          {daysLeft != null && <> This demo shop is kept for {daysLeft} more days.</>}
        </div>
      </section>

      <h2 className="mt-14 text-xs font-medium uppercase tracking-[0.14em] text-amber-400/90">See it work in four steps</h2>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        {steps.map((s, i) => (
          <li key={s.title} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <span className="grid size-7 place-items-center rounded-full bg-amber-500/15 text-sm font-medium text-amber-300">{i + 1}</span>
            <h3 className="mt-3 font-medium text-cream">{s.title}</h3>
            <p className="mt-1 flex-1 text-sm text-smoke">{s.body}</p>
            <Link href={s.href} className="mt-4 inline-flex items-center gap-1 text-sm text-amber-300 transition-colors hover:text-amber-200">
              {s.cta} <span aria-hidden>→</span>
            </Link>
          </li>
        ))}
      </ol>
    </main>
  );
}

function LinkRow({ label, value, href, note }: { label: string; value: string; href?: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-smoke">{label}</p>
        {href ? (
          <Link href={href} className="block truncate font-mono text-sm text-cream hover:underline">
            {value}
          </Link>
        ) : (
          <p className="truncate font-mono text-sm text-cream">{value}</p>
        )}
        {note && <p className="mt-0.5 text-xs text-smoke">{note}</p>}
      </div>
      <CopyButton text={value} />
    </div>
  );
}
