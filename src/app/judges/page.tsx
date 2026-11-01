import type { Metadata } from "next";
import Link from "next/link";
import { CopyButton } from "@/app/seller/connect/widgets";
import { DEMO_SHOP, REPO_URL } from "@/components/site/nav-links";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { requestBaseUrl } from "@/lib/base-url";
import { DEMO_SELLER_SLUG } from "@/lib/seller";

export const metadata: Metadata = {
  title: "Judge's guide · AgentShelf",
  description: "Four short paths through AgentShelf: as a buyer, through an AI assistant, as a seller, and with your own shop.",
};

export const dynamic = "force-dynamic";

const PROMPT =
  "I'm looking for a cozy candle under $30 as a gift from Maya's Candles. Do you ship to Canada? Ask the seller if it's soy wax, then check out the best one for me.";

const FEATURES: [feature: string, where: string, href: string][] = [
  ["PayPal Orders v2: create + capture", "Any checkout (storefront or AI)", DEMO_SHOP],
  ["PayPal JS SDK v6 buttons (Venmo, Pay Later)", "Storefront", DEMO_SHOP],
  ["Payments v2 refunds, never twice", "Inbox → approve a refund", "/seller/inbox"],
  ["Shipment Tracking, PayPal emails the buyer", "Inbox → Ready to ship", "/seller/inbox"],
  ["Disputes + verified webhooks", "Inbox and Dashboard → PayPal disputes", "/seller/dashboard"],
  ["Catalog Products via the Agent Toolkit", "Add products from a photo", "/seller/listings"],
  ["Market prices from Channel3 image search", "Add products from a photo", "/seller/listings"],
  ["PayPal Agent Toolkit (seller agent's tools)", "Inbox → Ask your agent", "/seller/inbox"],
  ["MCP server + product cards in chat (MCP Apps)", "Claude / ChatGPT connector", "/seller/connect"],
  ["AG Studio: custom widgets + our agent in Studio's team", "Dashboard → Ask AI", "/seller/dashboard"],
  ["Facts AI can't get wrong (llms.txt, JSON-LD)", "AI's view", "/seller/ai-view"],
];

export default async function Judges() {
  const mcpUrl = `${await requestBaseUrl()}/api/mcp/${DEMO_SELLER_SLUG}`;

  const paths = [
    {
      who: "As a buyer",
      time: "2 min",
      steps: [
        <>Open <Link href={DEMO_SHOP} className="text-cream underline-offset-2 hover:underline">Maya&apos;s Candles</Link> and press <b>Buy</b> on any candle.</>,
        <>Pay with the <b>PayPal sandbox buyer</b> login from the Devpost submission. No real money moves.</>,
        <>You land on the receipt; the order is now in Maya&apos;s Inbox.</>,
      ],
      cta: ["Open the demo shop", DEMO_SHOP],
    },
    {
      who: "Through an AI assistant",
      time: "3 min",
      steps: [
        <>In Claude: Settings → Connectors → <b>Add custom connector</b>, and paste the shop address below.</>,
        <>Ask the prompt below. Claude searches, asks the seller, and shows <b>product cards</b> with Buy with PayPal.</>,
        <>Approve in PayPal; the card flips to <b>Paid</b>.</>,
      ],
      cta: ["Setup for other assistants", "/seller/connect"],
      extra: true,
    },
    {
      who: "As the seller",
      time: "3 min",
      steps: [
        <><Link href="/signin" className="text-cream underline-offset-2 hover:underline">Sign in</Link> as Maya with the demo password from the Devpost submission.</>,
        <><b>Inbox</b>: refunds the agent did on its own, ones over the limit waiting for approval, disputes, orders to ship.</>,
        <><b>Dashboard</b> → <b>Ask AI</b> → “What needs me today?”: our PayPal agent working inside AG Studio.</>,
      ],
      cta: ["Seller sign-in", "/signin"],
    },
    {
      who: "With your own shop",
      time: "2 min",
      steps: [
        <>Create a shop: name, the facts AI will quote, a password.</>,
        <>You get your own storefront, MCP server, seller agent and dashboard.</>,
        <>Connect it to Claude and ask something only your shop&apos;s facts can answer.</>,
      ],
      cta: ["Create your shop", "/start"],
    },
  ];

  return (
    <div className="dark min-h-screen overflow-x-clip bg-wax text-cream [color-scheme:dark]">
      <SiteHeader current="/judges" />
      <main className="relative">
        <div
          aria-hidden
          className="candle-glow pointer-events-none absolute -top-48 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.11),transparent)]"
        />
        <section className="relative mx-auto max-w-6xl px-4 pt-16 pb-12 sm:px-6 sm:pt-24">
          <p className="text-sm font-medium text-amber-400">Judge&apos;s guide</p>
          <h1 className="mt-3 max-w-3xl text-4xl leading-[1.05] font-semibold tracking-[-0.04em] sm:text-6xl">
            See all of AgentShelf in ten minutes.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-smoke">
            Four short paths, each on its own. Everything runs in the PayPal sandbox. Logins for the sandbox buyer and the
            demo seller are in the Devpost submission.
          </p>
        </section>

        <section className="relative mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-2">
          {paths.map((p, i) => (
            <article key={p.who} className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.025] p-6">
              <div className="flex items-center justify-between">
                <span className="grid size-8 place-items-center rounded-full bg-amber-500/15 text-sm font-medium text-amber-300">{i + 1}</span>
                <span className="text-xs text-smoke">{p.time}</span>
              </div>
              <h2 className="mt-4 text-xl font-semibold tracking-tight">{p.who}</h2>
              <ol className="mt-3 flex-1 space-y-2.5 text-sm text-smoke">
                {p.steps.map((step, j) => (
                  <li key={j} className="flex gap-2.5">
                    <span className="mt-[0.45rem] size-1 shrink-0 rounded-full bg-smoke/60" aria-hidden />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {p.extra && (
                <div className="mt-4 space-y-2">
                  <CopyRow label="Shop address" value={mcpUrl} />
                  <CopyRow label="Prompt" value={PROMPT} />
                </div>
              )}
              <Link
                href={p.cta[1]}
                className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/10 px-4 py-2 text-sm text-cream transition hover:border-white/25 hover:bg-white/[0.04]"
              >
                {p.cta[0]} <span aria-hidden>→</span>
              </Link>
            </article>
          ))}
        </section>

        <section className="relative mx-auto max-w-6xl px-4 pt-20 pb-24 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Where each feature lives</h2>
          <p className="mt-2 text-smoke">
            Every PayPal API and AI feature, and the screen that shows it. The{" "}
            <a href={REPO_URL} className="text-cream underline-offset-2 hover:underline">
              README
            </a>{" "}
            links each one to its code.
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-white/[0.07]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.03] text-xs uppercase tracking-[0.1em] text-smoke">
                <tr>
                  <th className="px-5 py-3 font-medium">Feature</th>
                  <th className="hidden px-5 py-3 font-medium sm:table-cell">Where to see it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.05]">
                {FEATURES.map(([feature, where, href]) => (
                  <tr key={feature} className="transition-colors hover:bg-white/[0.02]">
                    <td className="px-5 py-3.5 text-cream">
                      {feature}
                      <Link href={href} className="mt-0.5 block text-xs text-amber-300 hover:text-amber-200 sm:hidden">
                        {where} →
                      </Link>
                    </td>
                    <td className="hidden px-5 py-3.5 sm:table-cell">
                      <Link href={href} className="text-smoke transition-colors hover:text-cream">
                        {where} <span aria-hidden>→</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-[0.7rem] text-smoke">{label}</p>
        <p className="truncate font-mono text-xs text-cream">{value}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}
