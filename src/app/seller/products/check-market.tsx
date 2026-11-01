"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Market watch on demand: look up similar products for sale for every product (Channel3). */
export function CheckMarket() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | string>("idle");
  const run = async () => {
    setState("busy");
    const res = await fetch("/api/seller/market", { method: "POST" }).catch(() => null);
    const out = (await res?.json().catch(() => null)) as { checked?: number; found?: number; error?: string } | null;
    setState(
      !res?.ok
        ? (out?.error ?? "Couldn't check right now.")
        : out?.checked
          ? `Checked ${out.checked}; market found for ${out.found}.`
          : "All checked in the last 6 hours.",
    );
    router.refresh();
  };
  return (
    <div className="flex items-center gap-2">
      {state !== "idle" && state !== "busy" && <span className="text-xs text-smoke">{state}</span>}
      <button
        type="button"
        onClick={run}
        disabled={state === "busy"}
        className="rounded-full border border-white/10 px-4 py-2 text-sm text-cream transition hover:border-white/25 hover:bg-white/[0.04] disabled:opacity-60"
      >
        {state === "busy" ? "Checking the market…" : "Check market prices"}
      </button>
    </div>
  );
}
