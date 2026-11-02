"use server";

import { headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";
import { getShop, ShopError, startCheckout } from "@/lib/shop";

/** Called by the storefront's PayPal/Venmo/Pay Later buttons. Returns the PayPal order id the SDK opens. */
export async function createStorefrontOrder(slug: string, productId: string, quantity: number) {
  const seller = await getShop(slug);
  if (!seller) throw new Error("Shop not found.");
  try {
    const checkout = await startCheckout(seller, {
      productId,
      quantity,
      channel: "human",
      caller: `ip:${clientIp(await headers())}`,
    });
    return { orderId: checkout.paypalOrderId };
  } catch (err) {
    // Server action errors are redacted in production, so pass known messages back explicitly.
    if (err instanceof ShopError) return { error: err.message };
    console.error("[storefront] create order failed:", err);
    return { error: "PayPal is unavailable right now. Please try again in a moment." };
  }
}
