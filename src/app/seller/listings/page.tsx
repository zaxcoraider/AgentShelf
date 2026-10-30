import { aiConfigured } from "@/lib/ai";
import { currentSeller } from "@/lib/seller";
import { Uploader } from "./uploader";

// Photo → listing onboarding: AI drafts from photos, the seller edits and publishes to PayPal.
export const dynamic = "force-dynamic";

export default async function Listings() {
  const seller = await currentSeller();
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <p className="text-sm opacity-60">{seller.name}</p>
      <h1 className="text-3xl font-semibold tracking-tight">Add products</h1>
      <p className="mt-1 text-sm opacity-70">
        Snap a photo of each product. AI writes the listing and suggests a price; you check it and publish. Each
        product goes into your PayPal catalog and becomes buyable on your storefront and by AI assistants.
      </p>
      <div className="mt-8">
        <Uploader enabled={aiConfigured("vision")} shopUrl={`/shop/${seller.slug}`} />
      </div>
    </main>
  );
}
