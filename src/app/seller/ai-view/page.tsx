import { and, asc, eq } from "drizzle-orm";
import Link from "next/link";
import { db, schema } from "@/lib/db";
import { type Issue, readiness } from "@/lib/readiness";
import { requireSeller } from "@/lib/seller-session";
import { publicProduct, usd } from "@/lib/shop";
import { policyLines } from "@/lib/shop-facts";
import { AskBox } from "./ask-box";

// "AI's view": the shop exactly as an assistant sees it, plus a check for facts it would have to guess.
export const dynamic = "force-dynamic";

const section = "mt-10";
const card = "rounded-xl border border-stone-200 p-5 dark:border-stone-800";

export default async function AiView() {
  const seller = await requireSeller();
  const products = await db.query.products.findMany({
    where: and(eq(schema.products.sellerId, seller.id), eq(schema.products.active, true)),
    orderBy: asc(schema.products.title),
  });
  const report = readiness(seller, products);
  const policy = policyLines(seller);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Your shop through AI&apos;s eyes</h1>
      <p className="mt-2 opacity-75">
        This is exactly what Claude, ChatGPT, and other assistants get when a shopper asks about {seller.name}. If a fact
        isn&apos;t here, an assistant has to guess, so the check below finds the gaps.
      </p>

      <section
        aria-label="AI readiness"
        className={`mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl p-5 ${
          report.ready
            ? "bg-emerald-50 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100"
            : "bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100"
        }`}
      >
        <p className="text-4xl font-semibold tabular-nums">{report.score}%</p>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold">
            {report.ready ? "AI-ready ✓" : `${report.fixes} ${report.fixes === 1 ? "fact" : "facts"} to add before assistants can answer for you`}
          </p>
          <p className="text-sm opacity-80">
            {report.ready
              ? "Assistants can answer shoppers' questions from your own facts, without guessing."
              : "Until then, assistants will say they don't know, or worse, guess."}
            {report.tips > 0 && ` ${report.tips} optional ${report.tips === 1 ? "tip" : "tips"} below.`}
          </p>
        </div>
      </section>

      {report.shop.length > 0 && (
        <ul className="mt-4 space-y-2">
          {report.shop.map((issue) => (
            <IssueRow key={issue.text} issue={issue} />
          ))}
        </ul>
      )}

      <section className={section}>
        <h2 className="text-lg font-semibold">Ask like a shopper</h2>
        <p className="mt-1 text-sm opacity-70">The answer an assistant gets from your shop, live.</p>
        <div className="mt-4">
          <AskBox />
        </div>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">What assistants are told about your shop</h2>
        <p className="mt-1 text-sm opacity-70">
          Returned by the <code className="font-mono text-xs">get_shop_policy</code> tool, and shown on your storefront and{" "}
          <Link href={`/shop/${seller.slug}/llms.txt`} className="underline">
            llms.txt
          </Link>
          .
        </p>
        <ul className={`${card} mt-4 space-y-1.5 text-sm`}>
          {policy.length ? policy.map((line) => <li key={line}>{line}</li>) : <li className="opacity-60">No policy yet.</li>}
        </ul>
      </section>

      <section className={section}>
        <h2 className="text-lg font-semibold">Your products, as assistants see them</h2>
        <ul className="mt-4 space-y-3">
          {report.products.map(({ product, issues }) => {
            const fixes = issues.filter((i) => i.level === "fix").length;
            return (
              <li key={product.id} className={card}>
                <div className="flex items-start gap-4">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route
                    <img src={product.imageUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-xl dark:bg-stone-900">
                      🕯️
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-medium">{product.title}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          fixes
                            ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                        }`}
                      >
                        {fixes ? `${fixes} to fix` : "AI-ready"}
                      </span>
                    </div>
                    <p className="text-sm opacity-70">
                      {usd(product.priceCents)}
                      {product.attributes.size && `, ${product.attributes.size}`}
                    </p>
                    {issues.length > 0 && (
                      <ul className="mt-3 space-y-1.5">
                        {issues.map((issue) => (
                          <IssueRow key={issue.text} issue={issue} />
                        ))}
                      </ul>
                    )}
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer opacity-70 hover:opacity-100">Show the raw data AI receives</summary>
                      <pre className="mt-2 overflow-x-auto rounded-lg bg-stone-100 p-3 font-mono text-xs leading-relaxed dark:bg-stone-900">
                        {JSON.stringify(publicProduct(product), null, 2)}
                      </pre>
                    </details>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        {products.length === 0 && (
          <p className="mt-4 text-sm opacity-70">
            No products yet.{" "}
            <Link href="/seller/listings" className="underline">
              Add your first one from a photo
            </Link>
            .
          </p>
        )}
      </section>
    </main>
  );
}

function IssueRow({ issue }: { issue: Issue }) {
  return (
    <li className="flex gap-2 text-sm">
      <span
        className={`mt-px shrink-0 rounded px-1.5 text-xs font-medium leading-5 ${
          issue.level === "fix"
            ? "bg-amber-200 text-amber-950 dark:bg-amber-900 dark:text-amber-100"
            : "bg-stone-200 text-stone-800 dark:bg-stone-800 dark:text-stone-200"
        }`}
      >
        {issue.level === "fix" ? "Fix" : "Tip"}
      </span>
      <span className="opacity-85">{issue.text}</span>
    </li>
  );
}
