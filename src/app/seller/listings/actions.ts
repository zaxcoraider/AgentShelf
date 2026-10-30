"use server";

import { revalidatePath } from "next/cache";
import { aiConfigured } from "@/lib/ai";
import { draftListing, ListingError, publishInput, publishListing, type ListingDraft } from "@/lib/listings";
import { requireSeller } from "@/lib/seller-session";

export type DraftResult = { ok: true; draft: ListingDraft & { alreadySells?: string } } | { ok: false; message: string };
export type PublishResult = { ok: true; productId: string; paypalProductId: string } | { ok: false; message: string };

async function photo(form: FormData) {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) throw new ListingError("Add a photo first.");
  return { data: Buffer.from(await file.arrayBuffer()), mediaType: file.type };
}

const failure = (err: unknown, fallback: string) => {
  if (err instanceof ListingError) return { ok: false as const, message: err.message };
  console.error("[listings]", err);
  return { ok: false as const, message: fallback };
};

export async function draft(form: FormData): Promise<DraftResult> {
  const seller = await requireSeller();
  if (!aiConfigured("vision")) return { ok: false, message: "No vision model is configured (AI_MODEL_VISION)." };
  try {
    return { ok: true, draft: await draftListing(seller, await photo(form)) };
  } catch (err) {
    return failure(err, "The AI couldn't read that photo. Try another one, or fill in the listing yourself.");
  }
}

export async function publish(form: FormData): Promise<PublishResult> {
  const seller = await requireSeller();
  const parsed = publishInput.safeParse({
    title: form.get("title"),
    description: form.get("description"),
    scent: form.get("scent") ?? "",
    size: form.get("size") ?? "",
    priceUsd: Number(form.get("priceUsd")),
    stock: Number(form.get("stock")),
  });
  if (!parsed.success) {
    const field = parsed.error.issues[0]?.path[0];
    return { ok: false, message: `Check the ${field === "priceUsd" ? "price" : String(field)}.` };
  }
  try {
    const product = await publishListing(seller, parsed.data, await photo(form));
    revalidatePath(`/shop/${seller.slug}`);
    return { ok: true, productId: product.id, paypalProductId: product.paypalProductId! };
  } catch (err) {
    return failure(err, "PayPal didn't accept the product. Nothing was published; try again.");
  }
}
