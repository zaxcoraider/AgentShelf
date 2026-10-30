"use client";

import { useActionState } from "react";
import { askAgent, approve, reject, ship, type FormState } from "./actions";

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

const SUGGESTIONS = [
  "Review the open disputes and tell me what to do",
  "Which paid orders still need to ship?",
  "Summarize this week's refunds",
];

export function AskAgent({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(askAgent, null);
  return (
    <form action={action} className="rounded-xl border border-stone-200 p-4 dark:border-stone-800">
      <label htmlFor="task" className="text-sm font-medium">
        Ask your agent
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="task"
          name="task"
          required
          disabled={!enabled || pending}
          placeholder={enabled ? "e.g. Ship order … with USPS 9400111…" : "Connect an AI model to talk to your agent"}
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-transparent px-3 py-1.5 text-sm disabled:opacity-50 dark:border-stone-700"
        />
        <button disabled={!enabled || pending} className={`${button} bg-stone-900 text-white hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900`}>
          {pending ? "Working…" : "Send"}
        </button>
      </div>
      {enabled && !state && (
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              disabled={pending}
              onClick={(e) => {
                const input = e.currentTarget.form?.elements.namedItem("task") as HTMLInputElement | null;
                if (input) input.value = s;
              }}
              className="rounded-full border border-stone-300 px-2.5 py-0.5 text-xs opacity-80 hover:opacity-100 dark:border-stone-700"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {state && (
        <div role="status" className="mt-3 text-sm">
          <p className={`whitespace-pre-wrap ${state.ok ? "" : "text-red-700 dark:text-red-400"}`}>{state.text}</p>
          {state.tools.length > 0 && <p className="mt-2 text-xs opacity-60">Used: {[...new Set(state.tools)].join(", ")}</p>}
        </div>
      )}
    </form>
  );
}
