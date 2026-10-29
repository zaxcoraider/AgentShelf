"use client";

import { useActionState } from "react";
import { approve, reject, ship, type FormState } from "./actions";

function Feedback({ state }: { state: FormState }) {
  if (!state) return null;
  return (
    <p role="status" className={`text-sm ${state.ok ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}>
      {state.message}
    </p>
  );
}

const button =
  "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 transition-colors";

export function ApprovalButtons({ actionId, amount }: { actionId: string; amount: string }) {
  const [approved, approveAction, approving] = useActionState(approve, null);
  const [rejected, rejectAction, rejecting] = useActionState(reject, null);
  const busy = approving || rejecting;
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <form action={approveAction}>
          <input type="hidden" name="actionId" value={actionId} />
          <button disabled={busy} className={`${button} bg-amber-600 text-white hover:bg-amber-700`}>
            {approving ? "Refunding…" : `Approve ${amount} refund`}
          </button>
        </form>
        <form action={rejectAction}>
          <input type="hidden" name="actionId" value={actionId} />
          <button
            disabled={busy}
            className={`${button} border border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800`}
          >
            {rejecting ? "Rejecting…" : "Reject"}
          </button>
        </form>
      </div>
      <Feedback state={approved ?? rejected} />
    </div>
  );
}

export function ShipForm({ orderId }: { orderId: string }) {
  const [state, action, pending] = useActionState(ship, null);
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="orderId" value={orderId} />
      <div className="flex flex-wrap gap-2">
        <select
          name="carrier"
          defaultValue="USPS"
          aria-label="Carrier"
          className="rounded-md border border-stone-300 bg-transparent px-2 py-1.5 text-sm dark:border-stone-700"
        >
          {["USPS", "UPS", "FEDEX", "DHL"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          name="trackingNumber"
          required
          placeholder="Tracking number"
          aria-label="Tracking number"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-transparent px-2 py-1.5 font-mono text-sm dark:border-stone-700"
        />
        <button disabled={pending} className={`${button} bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900`}>
          {pending ? "Saving…" : "Mark shipped"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}
