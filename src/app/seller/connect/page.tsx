import { and, count, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireSeller } from "@/lib/seller-session";
import { requestBaseUrl } from "@/lib/base-url";
import { ConnectionTest, CopyButton, SetupTabs, Snippet, type SetupGuide } from "./widgets";

// "Connect your AI": the shop's MCP URL, how to add it to each assistant, and a prompt to try.
export const dynamic = "force-dynamic";

const TOOLS = [
  ["Search products", "Finds items by keywords and price."],
  ["Get product details", "Materials, size, scent, price, and stock."],
  ["Get shop policy", "Where you ship, delivery times, returns, and materials."],
  ["Ask the seller", "Answers shopper questions from your shop policy."],
  ["Create checkout", "Makes a PayPal order and hands the buyer a link to approve."],
  ["Get order status", "Payment and shipping status, with tracking."],
  ["Request a refund", "Goes through your refund rules; big ones wait for you."],
];

export default async function Connect() {
  const seller = await requireSeller();
  const base = await requestBaseUrl();
  const mcpUrl = `${base}/api/mcp/${seller.slug}`;
  const marketplaceUrl = `${base}/api/mcp`;
  const isLocal = /^https?:\/\/(localhost|127\.|0\.0\.0\.0)/.test(mcpUrl);

  const assistants = await db
    .select({ name: sql<string>`coalesce(${schema.orders.agentName}, 'Unnamed assistant')`, orders: count() })
    .from(schema.orders)
    .where(and(eq(schema.orders.sellerId, seller.id), eq(schema.orders.channel, "ai_agent")))
    .groupBy(sql`1`)
    .orderBy(desc(count()));

  const guides: SetupGuide[] = [
    {
      id: "claude",
      name: "Claude",
      steps: [
        "In Claude (desktop app or claude.ai), open Settings → Connectors.",
        "Choose “Add custom connector”.",
        `Name it “${seller.name}” and paste your shop URL. No sign-in is needed.`,
        "Start a new chat and ask Claude to shop. It will ask before using a tool.",
      ],
      note: isLocal ? "Custom connectors need a public https address, so this works once AgentShelf is deployed." : undefined,
    },
    {
      id: "claude-desktop-config",
      name: "Claude Desktop (config file)",
      steps: [
        "Open Claude Desktop → Settings → Developer → Edit Config.",
        "Add this to claude_desktop_config.json, then restart Claude Desktop.",
      ],
      snippet: JSON.stringify(
        {
          mcpServers: {
            [seller.slug]: {
              command: "npx",
              // http-only keeps the product-card (MCP Apps) handshake intact; --allow-http permits localhost.
              args: ["-y", "mcp-remote", mcpUrl, "--transport", "http-only", ...(mcpUrl.startsWith("http:") ? ["--allow-http"] : [])],
            },
          },
        },
        null,
        2,
      ),
      note: "This route also works with a local address, so you can test before deploying. It needs Node.js installed.",
    },
    {
      id: "claude-code",
      name: "Claude Code",
      steps: ["Run this in your terminal, then start Claude Code and ask it to shop."],
      snippet: `claude mcp add --transport http ${seller.slug} ${mcpUrl}`,
    },
    {
      id: "chatgpt",
      name: "ChatGPT",
      steps: [
        "In ChatGPT, open Settings → Apps & Connectors → Advanced, and turn on Developer mode.",
        "Create a new connector, paste your shop URL, and set authentication to none.",
        "In a new chat, pick the connector from the tools menu and ask it to shop.",
      ],
      note: isLocal ? "ChatGPT needs a public https address, so this works once AgentShelf is deployed." : undefined,
    },
    {
      id: "other",
      name: "Cursor & others",
      steps: ["Most MCP apps accept a remote server URL. Add this to the app's MCP settings:"],
      snippet: JSON.stringify({ mcpServers: { [seller.slug]: { url: mcpUrl } } }, null, 2),
    },
  ];

  const tryPrompt = seller.visitor
    ? `I'm looking for a gift under $30 from ${seller.name}. What do you recommend? Ask the seller what it's made of and whether they ship to me, then check out the best one for me.`
    : `I'm looking for a cozy candle under $30 as a gift from ${seller.name}. What do you recommend? Ask the seller if it's soy wax, then check out the best one for me.`;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Connect your AI</h1>
      <p className="mt-1 text-sm opacity-70">
        Two ways AI shoppers reach you. Either way they can browse, ask questions, and pay with PayPal without leaving
        the chat, and your own facts, refund rules and agent apply.
      </p>

      <section className="mt-8 rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-medium text-cream">AgentShelf marketplace: one connector, every shop</h2>
          <span className={`text-xs ${seller.marketplace ? "text-emerald-300" : "text-smoke"}`}>
            {seller.marketplace ? "Your shop is listed" : "Your shop is not listed (Settings)"}
          </span>
        </div>
        <p className="mt-1 text-sm text-smoke">
          Shoppers add this once and search every AgentShelf shop at once, so they can find you without knowing your
          shop first.
        </p>
        <div className="mt-3 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-stone-900 px-3 py-2 font-mono text-sm">{marketplaceUrl}</code>
          <CopyButton text={marketplaceUrl} />
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-stone-200 p-4 dark:border-stone-800">
        <h2 className="text-sm font-medium opacity-70">Your shop&apos;s own connector (just your shop, your name on it)</h2>
        <div className="mt-2 flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-stone-100 px-3 py-2 font-mono text-sm dark:bg-stone-900">
            {mcpUrl}
          </code>
          <CopyButton text={mcpUrl} />
        </div>
        <div className="mt-3">
          <ConnectionTest mcpUrl={mcpUrl} />
        </div>
        {isLocal && (
          <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
            This is a local address, so only apps on this computer can reach it. Hosted assistants like claude.ai and
            ChatGPT need the deployed URL.
          </p>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Add it to your assistant</h2>
        <div className="mt-3">
          <SetupTabs guides={guides} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Try it</h2>
        <p className="mt-1 text-sm opacity-70">Paste this into a new chat once your shop is connected.</p>
        <Snippet code={tryPrompt} />
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">What assistants can do in your shop</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {TOOLS.map(([name, what]) => (
            <li key={name} className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
              <p className="text-sm font-medium">{name}</p>
              <p className="mt-0.5 text-sm opacity-70">{what}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm opacity-60">
          Assistants can never move money on their own: the buyer approves every payment in PayPal, and refunds follow
          your rules.
        </p>
      </section>

      {assistants.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Assistants that have bought here</h2>
          <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-800">
            {assistants.map((a) => (
              <li key={a.name} className="flex justify-between py-2 text-sm">
                <span>{a.name}</span>
                <span className="opacity-70">
                  {a.orders} order{a.orders === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
