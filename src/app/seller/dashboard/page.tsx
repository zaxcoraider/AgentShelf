import { dashboardData } from "@/lib/dashboard-data";
import { requireSeller } from "@/lib/seller-session";
import { SellerStudio } from "./studio";

// The seller dashboard, built with AG Studio: sales, AI vs storefront, the agent's work, disputes.
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const seller = await requireSeller();
  const data = await dashboardData(seller);
  return (
    <main className="flex h-[calc(100dvh-3.5rem)] flex-col px-4 py-6 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <div className="mt-4 min-h-0 flex-1">
        <SellerStudio data={data} licenseKey={process.env.AG_STUDIO_LICENSE_KEY || undefined} />
      </div>
    </main>
  );
}
