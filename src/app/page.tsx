import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";

// Placeholder home: proves the app reads the seeded shop. Replaced by the dashboard in Phase 2.
export const dynamic = "force-dynamic";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function Home() {
  const seller = await db.query.sellers.findFirst();
  if (!seller) {
    return (
      <main className="mx-auto max-w-2xl p-8">
        <h1 className="text-2xl font-semibold">AgentShelf</h1>
        <p className="mt-2">No shop yet. Run <code>npm run db:setup</code> to seed the demo seller.</p>
      </main>
    );
  }

  const [products, orders] = await Promise.all([
    db.query.products.findMany({ where: eq(schema.products.sellerId, seller.id) }),
    db.query.orders.findMany({
      where: eq(schema.orders.sellerId, seller.id),
      orderBy: desc(schema.orders.createdAt),
    }),
  ]);
  const aiOrders = orders.filter((o) => o.channel === "ai_agent");
  const revenue = orders.reduce((sum, o) => sum + o.amountCents - o.refundedCents, 0);

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{seller.name}</h1>
      <p className="text-sm opacity-70">{seller.tagline}</p>
      <p className="mt-4">
        {orders.length} orders · {aiOrders.length} from AI shoppers · {usd(revenue)} net
      </p>
      <ul className="mt-6 space-y-1">
        {products.map((p) => (
          <li key={p.id} className="flex justify-between border-b py-1">
            <span>{p.title}</span>
            <span>{usd(p.priceCents)}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
