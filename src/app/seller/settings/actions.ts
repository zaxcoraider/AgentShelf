"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { SHIP_TO } from "@/app/start/options";
import { db, schema } from "@/lib/db";
import type { ShopPolicy } from "@/lib/db/schema";
import { canEditShop, requireSeller } from "@/lib/seller-session";

export type SettingsState = { ok: boolean; message: string; errors?: Record<string, string> } | null;

const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

/** Save the shop's tagline, the facts AI assistants quote, and the agent's auto-refund limit. */
export async function updateSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const seller = await requireSeller();
  if (!canEditShop(seller)) {
    return { ok: false, message: "The demo shop is read-only so every judge sees the same demo. Create your own shop to try editing." };
  }
  const current = seller.shopPolicy;

  const tagline = text(form, "tagline");
  const ownerName = text(form, "ownerName");
  const shipsFrom = text(form, "shipsFrom");
  const materials = text(form, "materials");
  const customOrders = text(form, "customOrders");
  const shippingUsd = Number(text(form, "shippingUsd"));
  const refundLimitUsd = Number(text(form, "refundLimitUsd"));
  const shipsToKey = text(form, "shipsTo");
  const shipsTo = shipsToKey === "keep" && current ? current.shipsTo : SHIP_TO[shipsToKey as keyof typeof SHIP_TO];
  const processing =
    text(form, "processing") === "keep" && current
      ? current.processingDays
      : text(form, "processing") === "3-5"
        ? { min: 3, max: 5 }
        : { min: 1, max: 2 };
  const returnsDays = Number(text(form, "returns"));

  const errors: Record<string, string> = {};
  if (tagline.length > 90) errors.tagline = "Keep it under 90 characters.";
  if (!ownerName || ownerName.length > 40) errors.ownerName = "Up to 40 characters.";
  if (shipsFrom.length < 2 || shipsFrom.length > 60) errors.shipsFrom = "Say where you ship from, e.g. Austin, Texas, USA.";
  if (materials.length < 3 || materials.length > 160) errors.materials = "A few words, up to 160 characters.";
  if (customOrders.length > 160) errors.customOrders = "Up to 160 characters.";
  if (!shipsTo) errors.shipsTo = "Pick where you ship.";
  if (!Number.isFinite(shippingUsd) || shippingUsd < 0 || shippingUsd > 50) errors.shippingUsd = "Between $0 (free) and $50.";
  if (!Number.isFinite(returnsDays) || returnsDays < 0 || returnsDays > 90) errors.returns = "Pick a returns window.";
  if (!Number.isFinite(refundLimitUsd) || refundLimitUsd < 0 || refundLimitUsd > 500) {
    errors.refundLimitUsd = "Between $0 (always ask me) and $500.";
  }
  if (Object.keys(errors).length) return { ok: false, errors, message: "A few fields need a look." };

  const policy: ShopPolicy = {
    shipsFrom,
    shipsTo: [...shipsTo!],
    processingDays: processing,
    carrier: current?.carrier ?? "USPS Ground Advantage",
    transitDays: current?.transitDays ?? { min: 3, max: 5 },
    shippingCents: Math.round(shippingUsd * 100),
    returnsDays,
    returnsCondition: current?.returnsCondition ?? "the item is unused and in its original packaging",
    returnShippingPaidBy: current?.returnShippingPaidBy ?? "buyer",
    damaged: current?.damaged ?? "full refund or a replacement. Send a photo of the damage.",
    materials,
    customOrders: customOrders || null,
  };

  await db
    .update(schema.sellers)
    .set({
      tagline: tagline || null,
      ownerName,
      shopPolicy: policy,
      refundAutoLimitCents: Math.round(refundLimitUsd * 100),
    })
    .where(eq(schema.sellers.id, seller.id));

  revalidatePath("/seller", "layout");
  revalidatePath(`/shop/${seller.slug}`);
  return { ok: true, message: "Saved. AI assistants quote the new facts from now on, and your agent follows the new refund limit." };
}
