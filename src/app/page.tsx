import { and, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { CopyButton } from "@/app/seller/connect/widgets";
import { requestBaseUrl } from "@/lib/base-url";
import { db, schema } from "@/lib/db";
import { usd } from "@/lib/money";
import { DEMO_SELLER_SLUG } from "@/lib/seller";

// Landing page: the pitch, live numbers from the demo shop, and the ways in.
export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Snap, list, done",
    body: "Drop in product photos. AI writes each listing and suggests a price; one click puts it in your PayPal catalog.",
  },
  {
    title: "AI assistants buy from you",
    body: "Your shop gets its own MCP server. Claude, ChatGPT, and others can browse, ask questions, and check out with PayPal. The buyer approves every payment.",
  },
  {
    title: "Your agent handles the rest",
    body: "Refunds within your limits, shipment tracking, dispute advice. Anything bigger waits for your one-click approval.",
  },
];

const PAYPAL = [
  "Agent Toolkit",
  "Orders v2",
  "Payments (capture + refund)",
  "Catalog Products",
  "Shipment Tracking",
  "Disputes",
  "Webhooks",
  "JS SDK v6",
];

const RULES = [
  "Refunds up to your limit run on their own; bigger ones wait for you.",
  "A daily cap on automatic refunds.",
  "Never on disputed or already-refunded orders.",
  "The agent never turns a buyer down by itself.",
  "Every action logged with the agent's reason.",
];

const card = "rounded-xl border border-stone-200 p-5 dark:border-stone-800";
const button = "rounded-lg px-4 py-2 text-sm font-medium transition-colors";

export default async function Home() {
  const seller = await db.query.sellers.findFirst({ where: eq(schema.sellers.slug, DEMO_SELLER_SLUG) });
  if (!seller) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">AgentShelf</h1>
        <p className="mt-2">
          No demo shop yet. Run <code>npm run db:setup</code> to create Maya&apos;s Candles.
        </p>
      </main>
    );
  }

  const [orders, featured] = await Promise.all([
    db.query.orders.findMany({ where: eq(schema.orders.sellerId, seller.id) }),
    db.query.products.findMany({
      where: and(eq(schema.products.sellerId, seller.id), eq(schema.products.active, true), isNotNull(schema.products.imageUrl)),
      orderBy: desc(schema.products.createdAt),
      limit: 3,
    }),
  ]);
  const paid = orders.filter((o) => o.status !== "created" && o.status !== "approved" && o.status !== "cancelled");
  const aiOrders = paid.filter((o) => o.channel === "ai_agent");
  const assistants = new Set(aiOrders.map((o) => o.agentName).filter(Boolean));
  const revenue = paid.reduce((sum, o) => sum + o.amountCents - o.refundedCents, 0);
  const mcpUrl = `${await requestBaseUrl()}/api/mcp/${seller.slug}`;

  const stats = [
    { value: String(paid.length), label: "orders" },
    { value: `${paid.length ? Math.round((aiOrders.length / paid.length) * 100) : 0}%`, label: "bought by AI assistants" },
    { value: String(assistants.size), label: "different assistants" },
    { value: usd(revenue), label: "net sales" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
      <nav className="flex items-center justify-between py-5 text-sm">
        <span className="font-semibold">AgentShelf</span>
        <a href="https://github.com/zaxcoraider/AgentShelf" className="opacity-70 hover:opacity-100">
          GitHub
        </a>
      </nav>

      <section className="pt-10 pb-12 sm:pt-16">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">For small sellers, powered by PayPal</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Your shop, buyable by AI assistants.
        </h1>
        <p className="mt-4 max-w-2xl text-lg opacity-75">
          AI assistants are becoming shoppers, but they can only buy from big stores. AgentShelf lets any small shop be
          found, questioned, and paid through PayPal by Claude, ChatGPT, and friends, and gives the seller an AI agent
          that handles the after-sale work within their rules.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/shop/${seller.slug}`} className={`${button} bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300`}>
            Visit {seller.name}
          </Link>
          <Link href="/seller/inbox" className={`${button} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900`}>
            Open the seller Inbox
          </Link>
          <Link href="/seller/connect" className={`${button} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-900`}>
            Connect your AI
          </Link>
        </div>
      </section>

      <section aria-label="Demo shop numbers" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className={card}>
            <p className="text-2xl font-semibold">{s.value}</p>
            <p className="mt-0.5 text-sm opacity-70">{s.label}</p>
          </div>
        ))}
        <p className="col-span-full text-xs opacity-50">
          Live from the demo shop, {seller.name}: seeded history plus real PayPal sandbox orders.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
        <ol className="mt-5 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className={card}>
              <span className="text-sm font-medium text-amber-700 dark:text-amber-400">{i + 1}</span>
              <h3 className="mt-1 font-medium">{step.title}</h3>
              <p className="mt-1 text-sm opacity-75">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {featured.length > 0 && (
        <section className="mt-16">
          <div className="flex items-baseline justify-between">
            <h2 className="text-2xl font-semibold tracking-tight">From {seller.name}</h2>
            <Link href={`/shop/${seller.slug}`} className="text-sm opacity-70 hover:opacity-100">
              See the shop →
            </Link>
          </div>
          <ul className="mt-5 grid gap-4 sm:grid-cols-3">
            {featured.map((p) => (
              <li key={p.id}>
                <Link href={`/shop/${seller.slug}`} className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route */}
                  <img src={p.imageUrl!} alt={p.title} className="aspect-[4/3] w-full rounded-xl object-cover" />
                  <p className="mt-2 font-medium">{p.title}</p>
                  <p className="text-sm opacity-70">{usd(p.priceCents)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-16 rounded-2xl bg-stone-100 p-6 sm:p-8 dark:bg-stone-900">
        <h2 className="text-2xl font-semibold tracking-tight">Try it with your own AI</h2>
        <p className="mt-2 max-w-2xl text-sm opacity-75">
          Add this MCP server to Claude, ChatGPT, or any MCP app (
          <Link href="/seller/connect" className="underline">
            setup steps
          </Link>
          ), then ask it to buy a candle. You approve the payment with a PayPal sandbox account.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-white px-3 py-2 font-mono text-sm dark:bg-stone-950">{mcpUrl}</code>
          <CopyButton text={mcpUrl} />
        </div>
        <p className="mt-4 text-sm italic opacity-75">
          “I&apos;m looking for a cozy candle under $30 as a gift from {seller.name}. Ask the seller if it&apos;s soy
          wax, then check out the best one for me.”
        </p>
      </section>

      <section className="mt-16 grid gap-4 sm:grid-cols-2">
        <div className={card}>
          <h2 className="font-semibold">Built on PayPal</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {PAYPAL.map((name) => (
              <li key={name} className="rounded-full bg-stone-100 px-3 py-1 text-sm dark:bg-stone-900">
                {name}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm opacity-70">Everything runs on the PayPal sandbox.</p>
        </div>
        <div className={card}>
          <h2 className="font-semibold">An agent that can&apos;t go rogue with money</h2>
          <ul className="mt-3 space-y-1.5 text-sm opacity-80">
            {RULES.map((rule) => (
              <li key={rule}>✓ {rule}</li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mt-16 border-t border-stone-200 pt-6 text-sm opacity-60 dark:border-stone-800">
        AgentShelf · built for{" "}
        <a href="https://paypalaihackathon.devpost.com" className="underline">
          Build What&apos;s Next with PayPal and AI
        </a>{" "}
        · <a href="https://github.com/zaxcoraider/AgentShelf" className="underline">source on GitHub</a>
      </footer>
    </main>
  );
}
