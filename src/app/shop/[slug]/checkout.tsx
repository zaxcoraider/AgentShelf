"use client";

import {
  PayLaterOneTimePaymentButton,
  PayPalOneTimePaymentButton,
  PayPalProvider,
  useEligibleMethods,
  VenmoOneTimePaymentButton,
} from "@paypal/react-paypal-js/sdk-v6";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usd } from "@/lib/money";
import { createStorefrontOrder } from "./actions";

/** Loads PayPal JS SDK v6 once for the whole storefront. */
export function CheckoutProvider({ clientId, children }: { clientId: string; children: React.ReactNode }) {
  return (
    <PayPalProvider
      clientId={clientId}
      environment="sandbox"
      components={["paypal-payments", "venmo-payments"]}
      pageType="checkout"
    >
      {children}
    </PayPalProvider>
  );
}

const MAX_QUANTITY = 5;

/** A Buy button that opens this product's PayPal options, so the page doesn't load buttons for every product. */
export function BuyToggle(props: Parameters<typeof BuyButtons>[0] & { price: string }) {
  const [open, setOpen] = useState(false);
  if (open) return <BuyButtons {...props} />;
  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="mt-4 w-full rounded-full bg-stone-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-stone-700 active:scale-[0.99]"
    >
      Buy for {props.price}
    </button>
  );
}

/** Quantity picker plus every PayPal payment method this buyer is eligible for. */
export function BuyButtons(props: {
  slug: string;
  productId: string;
  priceCents: number;
  shippingCents: number;
  stock: number;
}) {
  const router = useRouter();
  const [quantity, setQuantity] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const totalCents = props.priceCents * quantity + props.shippingCents;
  const { eligiblePaymentMethods } = useEligibleMethods({
    payload: { amount: (totalCents / 100).toFixed(2), currencyCode: "USD" },
  });

  const session = {
    createOrder: async () => {
      setError(null);
      const result = await createStorefrontOrder(props.slug, props.productId, quantity);
      if ("error" in result) {
        setError(result.error ?? "Checkout failed.");
        throw new Error(result.error);
      }
      return result;
    },
    // The return page captures the payment (idempotently) and shows the receipt.
    onApprove: async ({ orderId }: { orderId: string }) => router.push(`/checkout/return?token=${orderId}`),
    onCancel: () => setError("Payment cancelled. You haven't been charged."),
    onError: () => setError("PayPal couldn't start the payment. Please try again."),
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          Qty
          <select
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="rounded-md border border-stone-300 bg-white px-2 py-1"
          >
            {Array.from({ length: Math.min(MAX_QUANTITY, props.stock) }, (_, i) => i + 1).map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="text-right">
          <span className="font-semibold">{usd(totalCents)}</span>{" "}
          <span className="text-stone-500">incl. {usd(props.shippingCents)} shipping</span>
        </span>
      </div>
      {/* PayPal's buttons are custom elements; stretch them to the card's width. */}
      <div className="space-y-2 [&>*]:block [&>*]:w-full">
        <PayPalOneTimePaymentButton {...session} />
        {eligiblePaymentMethods?.isEligible("venmo") && <VenmoOneTimePaymentButton {...session} />}
        {eligiblePaymentMethods?.isEligible("paylater") && <PayLaterOneTimePaymentButton {...session} />}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
