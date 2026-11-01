import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { StartForm } from "./form";

export const metadata: Metadata = {
  title: "Create your shop · AgentShelf",
  description: "Open a shop AI assistants can buy from, with PayPal checkout and a seller agent, in about a minute.",
};

const YOU_GET = [
  ["A storefront", "with PayPal checkout for human shoppers."],
  ["Your own MCP server", "so Claude, ChatGPT and other assistants can browse, answer questions and check out."],
  ["A seller agent", "that handles refunds within your rules, adds tracking and drafts dispute replies."],
  ["An AG Studio dashboard", "with an AI analyst that knows your PayPal disputes, refunds and orders."],
];

export default function Start() {
  return (
    <div className="dark relative min-h-screen overflow-x-clip bg-wax text-cream [color-scheme:dark]">
      <div
        aria-hidden
        className="candle-glow pointer-events-none absolute -top-40 left-1/4 size-[46rem] rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.12),transparent)]"
      />
      <SiteHeader current="/start" />

      <main className="relative mx-auto grid max-w-6xl gap-12 px-4 pt-8 pb-24 sm:px-6 lg:grid-cols-[1fr_minmax(0,34rem)] lg:gap-16 lg:pt-16">
        <section className="lg:sticky lg:top-28 lg:self-start">
          <p className="text-sm font-medium text-amber-400">Try it as a seller</p>
          <h1 className="mt-3 text-4xl leading-[1.05] font-semibold tracking-[-0.035em] sm:text-5xl">
            Open a shop AI assistants can buy from.
          </h1>
          <p className="mt-4 max-w-md text-lg text-smoke">About a minute. No PayPal account needed: it runs in the sandbox.</p>
          <ul className="mt-10 space-y-5">
            {YOU_GET.map(([title, body]) => (
              <li key={title} className="flex gap-3">
                <span aria-hidden className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-amber-500/15 text-amber-400">
                  <svg viewBox="0 0 20 20" className="size-3" fill="currentColor">
                    <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
                  </svg>
                </span>
                <p className="text-smoke">
                  <span className="font-medium text-cream">{title}</span> {body}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-md sm:p-8">
          <StartForm />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
