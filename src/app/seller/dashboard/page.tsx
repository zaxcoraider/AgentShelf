import Link from "next/link";
import { dashboardData } from "@/lib/dashboard-data";
import { requireSeller } from "@/lib/seller-session";
import { studioModels } from "@/lib/studio-agent/models";
import { LiveUpdates } from "../inbox/live";
import { SellerStudio } from "./studio";

// The seller dashboard, built with AG Studio: sales, AI vs storefront, the agent's work, disputes.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const seller = await requireSeller();
  const data = await dashboardData(seller);
  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col px-4 py-6 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <LiveUpdates />
      </div>
      {data.sources.find((s) => s.id === "orders")?.data.length === 0 && (
        <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.07] px-4 py-2.5 text-sm text-amber-100/90">
          No sales yet. When an AI assistant or a shopper buys from {seller.name}, this dashboard fills in live.{" "}
          <Link href="/seller/connect" className="text-amber-300 underline-offset-2 hover:underline">
            Connect an assistant
          </Link>
        </p>
      )}
      <div className="mt-4 min-h-0 flex-1">
        <SellerStudio data={data} licenseKey={process.env.AG_STUDIO_LICENSE_KEY || undefined} models={studioModels()} />
      </div>
    </main>
  );
}
