import {
  type AgAiEvent,
  type AgAiHarnessSetup,
  type AgAiModel,
  type AgAiPromptStarter,
  type AgAiTool,
  type AgAiToolContext,
  type AgLlmAdapter,
  type AgLlmResponse,
  type AgStudioApi,
  createAiHarness,
  directLlmRunner,
} from "ag-studio";

/**
 * AgentShelf's Studio Agent Framework setup:
 *  - an AgLlmAdapter that streams each turn through our own server route (Nebius, key server-side),
 *  - our own PayPal seller agent with custom tools backed by the shop's live data and refund rules,
 *  - our own lead: Studio's built-in lead, extended to also delegate to the seller agent,
 *    so one conversation can both explain the business and build the dashboard.
 */

// ---------- The adapter: AgLlmRequest → /api/seller/studio/llm (NDJSON of AG-UI events) ----------

function failed(code: string, message: string): AgLlmResponse {
  return { id: crypto.randomUUID(), createdAt: Date.now(), output: [], status: "failed", error: { code, message } };
}

export function proxyAdapter(endpoint: string): AgLlmAdapter {
  return {
    executeTurn(request, options) {
      const queue: AgAiEvent[] = [];
      let finished = false;
      let wake: (() => void) | null = null;
      const notify = () => {
        wake?.();
        wake = null;
      };
      let resolveComplete!: (r: AgLlmResponse) => void;
      const complete = new Promise<AgLlmResponse>((r) => (resolveComplete = r));

      // Read eagerly, so the turn completes whether or not anyone iterates the stream.
      (async () => {
        let response: AgLlmResponse | undefined;
        try {
          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
            signal: options?.signal,
          });
          if (!res.ok || !res.body) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            response = failed(`http_${res.status}`, body?.error ?? "The assistant is unavailable right now.");
            return;
          }
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = "";
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              if (!line.trim()) continue;
              const msg = JSON.parse(line) as AgAiEvent | { type: "COMPLETE"; response: AgLlmResponse };
              if (msg.type === "COMPLETE") response = (msg as { response: AgLlmResponse }).response;
              else queue.push(msg as AgAiEvent);
              notify();
            }
          }
        } catch (err) {
          response = options?.signal?.aborted
            ? { ...failed("cancelled", "Cancelled."), status: "cancelled" }
            : failed("network", err instanceof Error ? err.message : "Network error.");
        } finally {
          finished = true;
          notify();
          resolveComplete(response ?? failed("no_response", "The assistant stopped without answering."));
        }
      })();

      const stream = {
        async *[Symbol.asyncIterator]() {
          for (;;) {
            if (queue.length) {
              yield queue.shift()!;
              continue;
            }
            if (finished) return;
            await new Promise<void>((r) => (wake = r));
          }
        },
      };
      return { stream, complete };
    },
  };
}

// ---------- The PayPal seller agent's tools (read-only, served by /api/seller/studio/tools) ----------

type ToolResult = { result?: unknown; error?: string };

async function callSellerTool(tool: string, args: Record<string, unknown>, signal: AbortSignal): Promise<ToolResult> {
  const res = await fetch("/api/seller/studio/tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, args }),
    signal,
  });
  return (await res.json().catch(() => ({ error: "Bad response." }))) as ToolResult;
}

function sellerTools(api: AgStudioApi): AgAiTool[] {
  const run =
    (tool: string, summary: (result: unknown) => string) =>
    async (args: Record<string, unknown>, ctx: AgAiToolContext) => {
      const out = await callSellerTool(tool, args, ctx.signal);
      if (out.error || out.result == null) return ctx.error(out.error ?? "No result.");
      return ctx.success(`${summary(out.result)}\n${JSON.stringify(out.result)}`, out.result);
    };
  const count = (r: unknown) => (Array.isArray(r) ? r.length : 0);

  return [
    api.defineAiTool({
      name: "shop_briefing",
      description:
        "What needs the seller now, from live shop + PayPal data: open PayPal disputes sorted by response deadline (hours left), refunds and other agent actions waiting for the seller's approval, paid orders not yet shipped, and the refund rules with today's remaining auto-refund headroom.",
      params: (s) => s.object({}),
      execute: run("shop_briefing", () => "Briefing:"),
    }),
    api.defineAiTool({
      name: "agent_activity",
      description:
        "The PayPal seller agent's own log, newest first: refunds, shipment tracking and dispute reviews it did, queued for approval, or that a guardrail blocked, each with the agent's one-line reason.",
      params: (s) =>
        s.object({
          outcome: s
            .enum(["Done by agent", "Needs you", "Approved", "Rejected", "Blocked by rule", "Failed"])
            .optional(),
          limit: s.number({ description: "How many to return, 1-50. Defaults to 15." }).optional(),
        }),
      execute: run("agent_activity", (r) => `${count(r)} agent actions:`),
    }),
    api.defineAiTool({
      name: "find_orders",
      description:
        "Find orders by buyer name, product, the assistant that bought it (e.g. Claude), or short order ref. Returns status, total, tracking and whether it is a live PayPal sandbox order or seeded demo history.",
      params: (s) => s.object({ query: s.string({ description: "Buyer, product, assistant, or order ref." }) }),
      execute: run("find_orders", (r) => `${count(r)} orders found:`),
    }),
    api.defineAiTool({
      name: "market_watch",
      description:
        "Market watch: each product's price against similar products for sale at other stores (found by Channel3 from the product photo): market low, median and high, how far the seller is above or below the median, examples, and recent competitor price changes.",
      params: (s) => s.object({}),
      execute: run("market_watch", () => "Market watch:"),
    }),
    api.defineAiTool({
      name: "check_refund",
      description:
        "Dry-run the shop's refund guardrails for one order: would the seller agent refund it automatically, ask the seller first, or refuse, and why. Never refunds anything.",
      params: (s) =>
        s.object({
          orderRef: s.string({ description: "The order's short ref from find_orders or shop_briefing." }),
          amount: s.number({ description: "Refund amount in dollars. Omit for a full refund." }).optional(),
        }),
      execute: run("check_refund", () => "Refund check:"),
    }),
  ];
}

// ---------- The roster: built-ins + our seller agent, fronted by our own lead ----------

const SELLER_INSTRUCTIONS = `You are the PayPal seller agent for a small online shop on AgentShelf. Shoppers buy through AI assistants (Claude, ChatGPT) and the storefront, and pay with PayPal.
You answer questions about the shop's operations: PayPal disputes and their deadlines, refunds and the refund rules, what the seller agent did on its own, what is waiting for the seller's approval, which orders need shipping, and pricing against the market (market_watch).
- On pricing, give a recommendation with numbers, but never claim you changed a price: the seller edits prices in Products.
- Use your tools; never guess an order, amount, date or rule. Quote amounts and deadlines exactly as tools return them.
- You are read-only here. You cannot refund, ship or answer disputes from the dashboard. If the seller wants that, point them to the Inbox in AgentShelf's seller menu (not PayPal): refunds are approved there, orders marked shipped there, and dispute recommendations shown there.
- "Seeded demo history" orders have no real PayPal payment behind them; say so if it matters.
- Be brief and concrete: lead with what needs doing first (earliest dispute deadline), then the rest. Use short bullet lists.
- When delegated a task, finish by reporting what you found in plain English.`;

const LEAD_ADDENDUM = `
This dashboard belongs to an AgentShelf seller who takes PayPal payments from AI assistants and a storefront.
You also have a "seller" agent: the PayPal seller agent. Delegate to it for anything about operations the dashboard tables don't answer on their own: what needs attention today, PayPal dispute deadlines, refund rules and whether a refund would be automatic, approvals waiting, orders to ship, what the seller agent did and why, and whether prices are right against the market (it has Market watch).
The "Market" table holds similar products for sale elsewhere (Channel3), and Products has "Market median" and "Price vs market", for charts comparing the seller's prices with the market.
For charts, tables, filters and layout, keep using the built-in agents. A request can need both: e.g. get the facts from the seller agent, then have the dashboard show them.
This dashboard has two AgentShelf widgets in the widget catalogue: "dispute-countdown" (live PayPal dispute deadlines) and "agent-feed" (live seller-agent actions). Both need no data mapping and no configuring: placing one is the whole job. When asked to show disputes or what the agent is doing, prefer them over building a chart or table.`;

export const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: "What needs me today?", prompt: "What needs my attention today? Start with the most urgent." },
  {
    label: "Chart AI vs storefront",
    prompt: "Add a line chart of net sales over time, split by whether an AI assistant or the storefront made the sale.",
  },
  { label: "Why was a refund blocked?", prompt: "Did the seller agent block or queue any refunds? Explain why for each." },
  {
    label: "Am I priced right?",
    prompt: "Am I priced right against the market? Add a bar chart of my price vs the market median for each product.",
  },
  {
    label: "Build a live watch page",
    prompt: "Add the dispute countdown and the seller agent feed side by side on this page.",
  },
];

export function aiSetup(models: AgAiModel[]): AgAiHarnessSetup {
  const adapter = proxyAdapter("/api/seller/studio/llm");
  return ({ api }) =>
    createAiHarness(api, ({ builtIn, tools }) => {
      const { lead, ...specialists } = builtIn;
      return {
        agents: [
          // Studio's own planning/data/page/widget agents, unchanged, on our model.
          ...Object.values(specialists).map((definition) => directLlmRunner({ ...definition, adapter })),
          // Our lead: Studio's built-in lead, with our seller agent added to its team.
          directLlmRunner({
            ...lead,
            name: "Shop assistant",
            adapter,
            instructions: (ctx, params) => `${lead.instructions?.(ctx, params as never) ?? ""}\n${LEAD_ADDENDUM}`,
            tools: (ctx, params) => [
              ...(lead.tools?.(ctx, params as never) ?? []).filter((t) => t.name !== "delegate_to"),
              tools.delegateTo(["planning", "data", "page", "widget", "seller"]),
            ],
          }),
          // Our PayPal seller agent: live shop data and refund rules, plus Studio's own query tools.
          directLlmRunner({
            id: "seller",
            name: "PayPal seller agent",
            description:
              "Knows the shop's live operations from PayPal and the order system: disputes and response deadlines, refunds and refund rules (dry-run), approvals waiting, orders to ship, and the seller agent's own action log. Read-only.",
            schema: (s) => s.undefined(),
            adapter,
            maxTurns: 12,
            instructions: () => SELLER_INSTRUCTIONS,
            tools: ({ studio }) => [...sellerTools(api), studio.viewSchema(), studio.executeQuery()],
          }),
        ],
        primary: "lead",
        models,
        promptStarters: PROMPT_STARTERS,
      };
    });
}
