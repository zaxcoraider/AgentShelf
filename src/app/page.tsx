import { and, desc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { CopyButton } from "@/app/seller/connect/widgets";
import { Logo } from "@/components/logo";
import { requestBaseUrl } from "@/lib/base-url";
import { db, schema } from "@/lib/db";
import { usd } from "@/lib/money";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { policyLines, shopPolicy } from "@/lib/shop-facts";
import { type Activity, Bento } from "./_landing/bento";
import { CountUp } from "./_landing/count-up";
import { HeroChat } from "./_landing/hero-chat";

// Landing page: the pitch, the product shown working on live demo-shop data, and the ways in.
export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Snap, list, done",
    body: "Drop in product photos. AI writes each listing and suggests a price; one click puts it in your PayPal catalog.",
  },
  {
    title: "AI assistants buy from you",
    body: "Your shop gets its own MCP server. Claude, ChatGPT, and others browse, ask questions, and check out with PayPal.",
  },
  {
    title: "Your agent handles the rest",
    body: "Refunds within your limits, shipment tracking, dispute advice. Anything bigger waits for your approval.",
  },
];

const ASSISTANTS = ["Claude", "ChatGPT", "Perplexity", "Cursor", "VS Code", "Any MCP client"];

const PAYPAL = [
  { name: "Agent Toolkit", use: "The seller agent's PayPal tools" },
  { name: "Orders v2", use: "Checkout created by the assistant" },
  { name: "Payments", use: "Capture and refunds" },
  { name: "Catalog Products", use: "Listings from photos" },
  { name: "Shipment Tracking", use: "Tracking on every order" },
  { name: "Disputes", use: "Reviews with deadlines" },
  { name: "Webhooks", use: "Verified, idempotent events" },
  { name: "JS SDK v6", use: "Buttons on the storefront" },
];

const MCP_TOOLS = ["search_products", "get_product", "ask_seller", "create_checkout", "get_order_status", "request_refund"];

const ACTION_LABEL: Record<string, string> = {
  refund_order: "Refund",
  add_tracking: "Shipment tracking added",
  create_shipment_tracking: "Shipment tracking added",
  review_dispute: "Dispute reviewed",
};

function ago(date: Date) {
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

const container = "mx-auto max-w-6xl px-4 sm:px-6";
const primary =
  "inline-flex items-center rounded-full bg-cream px-5 py-2.5 text-sm font-semibold text-wax transition hover:bg-white";
const secondary =
  "inline-flex items-center rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-cream transition hover:border-white/20 hover:bg-white/[0.06]";

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

  const [orders, products, actions] = await Promise.all([
    db.query.orders.findMany({ where: eq(schema.orders.sellerId, seller.id) }),
    db.query.products.findMany({
      where: and(eq(schema.products.sellerId, seller.id), eq(schema.products.active, true)),
      orderBy: desc(schema.products.createdAt),
    }),
    db.query.agentActions.findMany({
      where: and(
        eq(schema.agentActions.sellerId, seller.id),
        inArray(schema.agentActions.tool, Object.keys(ACTION_LABEL)),
        // Show the agent's real work, not guardrail refusals from testing.
        inArray(schema.agentActions.status, ["auto", "approved", "pending_approval"]),
      ),
      orderBy: desc(schema.agentActions.createdAt),
      limit: 60,
    }),
  ]);
  const paid = orders.filter((o) => o.status !== "created" && o.status !== "approved" && o.status !== "cancelled");
  const aiOrders = paid.filter((o) => o.channel === "ai_agent");
  const assistants = new Set(aiOrders.map((o) => o.agentName).filter(Boolean));
  const revenue = paid.reduce((sum, o) => sum + o.amountCents - o.refundedCents, 0);
  const mcpUrl = `${await requestBaseUrl()}/api/mcp/${seller.slug}`;
  const featured = products.filter((p) => p.imageUrl).slice(0, 3);

  // The hero demo uses a real product from the shop: a photographed one under $30 if there is one.
  const affordable = products.filter((p) => p.priceCents <= 3000);
  const star = affordable.find((p) => p.imageUrl) ?? affordable[0] ?? products[0];
  const attrs = star?.attributes ?? {};
  const heroProduct = star && {
    title: star.title,
    price: usd(star.priceCents),
    imageUrl: star.imageUrl,
    details: [attrs.size, attrs.burnTime && `${attrs.burnTime} burn`].filter(Boolean).join(", "),
  };
  // Grounded in the shop's own facts: the product's attributes first, then the shop's materials policy.
  const materials = (shopPolicy(seller)?.materials ?? policyLines(seller).find((line) => /wax/i.test(line)))?.split(". ")[0];
  const waxAnswer = attrs.wax
    ? `Yes, it's ${attrs.wax.toLowerCase()} wax${attrs.wick ? ` with a ${attrs.wick} wick` : ""}.`
    : materials
      ? `${/soy/i.test(materials) ? "Yes: " : ""}${materials.replace(/\.$/, "")}.`
      : "I'll check with the seller and get back to you.";

  // A mix of the agent's work: the newest action of each kind first, then the newest overall.
  const firstOfEach = [...new Map(actions.map((a) => [ACTION_LABEL[a.tool], a] as const).reverse()).values()];
  const mixed = [...new Set([...firstOfEach, ...actions])]
    .slice(0, 4)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const activity: Activity[] = mixed.map((a) => ({
    id: a.id,
    label: ACTION_LABEL[a.tool] ?? a.tool,
    status: a.status,
    reason: a.reason ?? "",
    when: ago(a.createdAt),
  }));
  const listing = featured[0] && { title: featured[0].title, price: usd(featured[0].priceCents), imageUrl: featured[0].imageUrl! };

  const stats = [
    { to: paid.length, format: "plain" as const, label: "Orders in the demo shop" },
    { to: paid.length ? Math.round((aiOrders.length / paid.length) * 100) : 0, format: "percent" as const, label: "Placed by AI assistants" },
    { to: assistants.size, format: "plain" as const, label: "Different assistants buying" },
    { to: Math.round(revenue / 100), format: "usd" as const, label: "Net sales through PayPal" },
  ];

  return (
    <div className="min-h-screen overflow-x-clip bg-wax text-cream selection:bg-ember/40">
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-wax/70 backdrop-blur-xl">
        <nav className={`${container} flex h-16 items-center justify-between text-sm`}>
          <Link href="/" aria-label="AgentShelf home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-7 text-smoke md:flex">
            <a href="#product" className="transition hover:text-cream">
              Product
            </a>
            <a href="#how" className="transition hover:text-cream">
              How it works
            </a>
            <a href="#developers" className="transition hover:text-cream">
              Developers
            </a>
            <a href="https://github.com/zaxcoraider/AgentShelf" className="transition hover:text-cream">
              GitHub
            </a>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/seller/inbox" className="hidden text-smoke transition hover:text-cream sm:block">
              Sign in
            </Link>
            <Link href={`/shop/${seller.slug}`} className="rounded-full bg-cream px-4 py-1.5 font-medium text-wax transition hover:bg-white">
              Demo shop
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative">
          {/* Fine grid, fading out from the top: structure without noise. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.045)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent)]"
          />
          <div className={`${container} relative grid items-center gap-16 pt-20 pb-24 lg:grid-cols-[1.1fr_1fr] lg:pt-28`}>
            <div>
              <Link
                href="/seller/connect"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pr-3 pl-1 text-xs text-smoke transition hover:border-white/20 hover:text-cream"
              >
                <span className="rounded-full bg-ember/15 px-2 py-0.5 font-medium text-flame">New</span>
                Every shop gets its own MCP server
              </Link>
              <h1 className="mt-6 text-5xl leading-[1.02] font-semibold tracking-[-0.045em] sm:text-6xl lg:text-[4.5rem]">
                Your shop, buyable by AI assistants.
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-smoke">
                Shoppers now ask Claude or ChatGPT to buy for them. AgentShelf lets any small shop be found, questioned,
                and paid through PayPal by those assistants, with an agent that runs the after-sale within your rules.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href={`/shop/${seller.slug}`} className={primary}>
                  Visit the demo shop
                </Link>
                <Link href="/seller/connect" className={secondary}>
                  Connect your AI
                </Link>
              </div>
            </div>
            {heroProduct && <HeroChat shopName={seller.name} product={heroProduct} waxAnswer={waxAnswer} />}
          </div>
        </section>

        <section aria-label="Works with" className="border-y border-white/[0.06]">
          <div className={`${container} flex flex-col items-center gap-5 py-8 md:flex-row md:justify-between`}>
            <p className="shrink-0 text-sm text-smoke">Works with any assistant that speaks MCP</p>
            <ul className="flex flex-wrap justify-center gap-x-8 gap-y-3">
              {ASSISTANTS.map((name) => (
                <li key={name} className="text-base font-semibold tracking-tight text-cream/45">
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="product" className={`${container} scroll-mt-20 pt-28`}>
          <SectionHead title="Everything after “add to cart”, handled.">
            Selling to AI assistants means answering their questions, taking their payments, and looking after the
            order. AgentShelf does all three on PayPal. Below is the demo shop, live.
          </SectionHead>
          <div className="mt-14">
            <Bento
              activity={activity}
              refundLimitCents={seller.refundAutoLimitCents}
              listing={listing ?? null}
              checkout={{ title: heroProduct?.title ?? "", price: heroProduct?.price ?? "" }}
              tools={MCP_TOOLS}
            />
          </div>
        </section>

        <section aria-label="Demo shop numbers" className={`${container} pt-24`}>
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-white/[0.07] md:grid-cols-4">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`flex flex-col-reverse p-6 sm:p-8 ${i % 2 ? "border-l" : ""} ${i > 1 ? "border-t md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""} border-white/[0.07]`}
              >
                <dt className="mt-2 text-sm text-smoke">{s.label}</dt>
                <dd className="text-4xl font-semibold tracking-[-0.04em] tabular-nums sm:text-5xl">
                  <CountUp to={s.to} format={s.format} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-smoke/70">
            Live from {seller.name}: seeded history plus real PayPal sandbox orders.
          </p>
        </section>

        <section id="how" className={`${container} scroll-mt-20 pt-28`}>
          <SectionHead title="Live in an afternoon.">Three steps from a box of candles to a shop AI can buy from.</SectionHead>
          <ol className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="bg-wax p-8">
                <span className="flex size-8 items-center justify-center rounded-full border border-ember/40 text-sm font-medium text-flame">
                  {i + 1}
                </span>
                <h3 className="mt-6 text-lg font-medium">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {featured.length > 0 && (
          <section className={`${container} pt-28`}>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <SectionHead title={`On the shelf at ${seller.name}.`}>
                Real listings, written by AI from the seller&apos;s photos.
              </SectionHead>
              <Link href={`/shop/${seller.slug}`} className={secondary}>
                See the whole shop
              </Link>
            </div>
            <ul className="mt-14 grid gap-6 sm:grid-cols-3">
              {featured.map((p) => (
                <li key={p.id}>
                  <Link href={`/shop/${seller.slug}`} className="group block">
                    <div className="overflow-hidden rounded-2xl border border-white/[0.07]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route */}
                      <img
                        src={p.imageUrl!}
                        alt={p.title}
                        className="aspect-[4/5] w-full object-cover transition duration-700 ease-out group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="mt-4 flex items-baseline justify-between gap-3">
                      <p className="font-medium">{p.title}</p>
                      <p className="shrink-0 text-sm text-smoke">{usd(p.priceCents)}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="developers" className={`${container} scroll-mt-20 pt-28`}>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <SectionHead title="Try it with your own AI.">
                Add this MCP server to Claude, ChatGPT, or any MCP app, then ask it to buy a candle. You approve the
                payment with a PayPal sandbox account.
              </SectionHead>
              <div className="mt-8 flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] p-1.5 pl-4">
                <code className="min-w-0 flex-1 truncate font-mono text-sm text-cream/90">{mcpUrl}</code>
                <CopyButton text={mcpUrl} label="Copy URL" className="rounded-lg bg-cream text-wax hover:bg-white" />
              </div>
              <Link href="/seller/connect" className="mt-4 inline-block text-sm text-smoke underline-offset-4 hover:text-cream hover:underline">
                Setup steps for each assistant
              </Link>
            </div>
            <Terminal productId={star?.id ?? "…"} price={heroProduct?.price ?? "$22.00"} />
          </div>
        </section>

        <section className={`${container} pt-28`}>
          <SectionHead title="Built on PayPal, end to end.">
            Every payment, refund, listing, and dispute goes through PayPal&apos;s APIs. Nothing is simulated.
          </SectionHead>
          <ul className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] md:grid-cols-4">
            {PAYPAL.map((api) => (
              <li key={api.name} className="bg-wax p-6">
                <p className="font-medium">{api.name}</p>
                <p className="mt-1 text-sm text-smoke">{api.use}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className={`${container} pt-28 pb-28`}>
          <div className="relative overflow-hidden rounded-3xl border border-white/[0.07] px-6 py-20 text-center">
            <div
              aria-hidden
              className="candle-glow pointer-events-none absolute inset-x-0 -bottom-40 mx-auto size-[36rem] rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.22),transparent)]"
            />
            <h2 className="relative mx-auto max-w-2xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Open your shop to every AI assistant.
            </h2>
            <p className="relative mx-auto mt-4 max-w-md text-smoke">
              Try the demo as a buyer, or sign in as Maya and watch the agent work.
            </p>
            <div className="relative mt-10 flex flex-wrap justify-center gap-3">
              <Link href={`/shop/${seller.slug}`} className={primary}>
                Visit the demo shop
              </Link>
              <Link href="/seller/inbox" className={secondary}>
                Open the seller Inbox
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className={`${container} grid gap-10 py-14 text-sm sm:grid-cols-[2fr_1fr_1fr]`}>
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-smoke">
              Built for{" "}
              <a href="https://paypalaihackathon.devpost.com" className="text-cream/80 hover:text-cream">
                Build What&apos;s Next with PayPal and AI
              </a>
              . Runs on the PayPal sandbox.
            </p>
          </div>
          <FooterLinks
            title="Try it"
            links={[
              ["Demo shop", `/shop/${seller.slug}`],
              ["Seller Inbox", "/seller/inbox"],
              ["Add products", "/seller/listings"],
            ]}
          />
          <FooterLinks
            title="Build"
            links={[
              ["Connect your AI", "/seller/connect"],
              ["llms.txt for AI assistants", "/llms.txt"],
              ["Source on GitHub", "https://github.com/zaxcoraider/AgentShelf"],
            ]}
          />
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="max-w-2xl">
      <h2 className="text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-smoke">{children}</p>
    </div>
  );
}

function FooterLinks({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-4 space-y-2.5 text-smoke">
        {links.map(([label, href]) => (
          <li key={href}>
            <Link href={href} className="transition hover:text-cream">
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What an assistant's create_checkout call looks like on the wire (shape matches src/lib/mcp/shop-server.ts). */
function Terminal({ productId, price }: { productId: string; price: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0f0c0a] shadow-[0_40px_100px_-30px_rgba(245,158,11,0.18)]">
      <div className="flex items-center gap-2 border-b border-white/[0.06] px-4 py-3">
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="size-2.5 rounded-full bg-white/10" />
        <span className="ml-3 font-mono text-xs text-smoke">tools/call</span>
      </div>
      <pre className="overflow-x-auto p-5 font-mono text-[13px] leading-6">
        <span className="text-smoke">{"// The assistant asks"}</span>
        {"\n"}
        <span className="text-cream/90">{"{ "}</span>
        <span className="text-flame">&quot;name&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-emerald-300">&quot;create_checkout&quot;</span>
        <span className="text-cream/90">{", "}</span>
        <span className="text-flame">&quot;arguments&quot;</span>
        <span className="text-cream/90">{": {"}</span>
        {"\n  "}
        <span className="text-flame">&quot;product_id&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-emerald-300">&quot;{productId}&quot;</span>
        <span className="text-cream/90">,</span>
        {"\n  "}
        <span className="text-flame">&quot;quantity&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-sky-300">1</span>
        <span className="text-cream/90">{" } }"}</span>
        {"\n\n"}
        <span className="text-smoke">{"// The shop answers"}</span>
        {"\n"}
        <span className="text-cream/90">{"{ "}</span>
        <span className="text-flame">&quot;total&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-emerald-300">&quot;{price}&quot;</span>
        <span className="text-cream/90">,</span>
        {"\n  "}
        <span className="text-flame">&quot;approveUrl&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-emerald-300">&quot;https://www.sandbox.paypal.com/checkoutnow?token=…&quot;</span>
        <span className="text-cream/90">,</span>
        {"\n  "}
        <span className="text-flame">&quot;next_step&quot;</span>
        <span className="text-cream/90">: </span>
        <span className="text-emerald-300">&quot;Show the user this link to approve…&quot;</span>
        <span className="text-cream/90">{" }"}</span>
      </pre>
    </div>
  );
}
