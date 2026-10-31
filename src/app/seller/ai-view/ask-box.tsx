"use client";

import { useActionState, useRef } from "react";
import { askAsShopper, type AskState } from "./actions";

const SUGGESTIONS = ["Do you ship to Canada?", "Is the wax paraffin?", "Can I return a candle I already burned?", "Do you offer gift wrapping?"];

/** Try the shop the way a shopper's assistant would, and see the exact answer it gets. */
export function AskBox() {
  const [state, action, pending] = useActionState<AskState, FormData>(askAsShopper, null);
  const input = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div>
      <form ref={formRef} action={action} className="flex gap-2">
        <input
          ref={input}
          name="question"
          required
          minLength={3}
          maxLength={300}
          placeholder="Ask anything a shopper might…"
          aria-label="Shopper question"
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-transparent px-3 py-2 text-sm dark:border-stone-700"
        />
        <button
          disabled={pending}
          className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-300"
        >
          {pending ? "Asking…" : "Ask"}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => {
              if (!input.current) return;
              input.current.value = q;
              formRef.current?.requestSubmit();
            }}
            className="rounded-full border border-stone-300 px-3 py-1 text-xs opacity-80 transition hover:opacity-100 disabled:opacity-40 dark:border-stone-700"
          >
            {q}
          </button>
        ))}
      </div>
      <div aria-live="polite" className="mt-4">
        {state && "error" in state && <p className="text-sm text-red-700 dark:text-red-400">{state.error}</p>}
        {state && "answer" in state && (
          <div className="rounded-lg bg-stone-100 p-4 text-sm dark:bg-stone-900">
            <p className="text-xs opacity-60">Shopper: {state.question}</p>
            <p className="mt-2 leading-relaxed">{state.answer}</p>
            <p className="mt-2 text-xs opacity-60">Answered from your shop policy and listings only, the same way ask_seller answers assistants.</p>
          </div>
        )}
      </div>
    </div>
  );
}
