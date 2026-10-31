"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { type ComponentProps, useEffect, useRef, useState } from "react";

const POLL_MS = 4000;

// When the last live refresh happened. Items that mount right after one are new, so they animate in;
// items on first load or after switching a filter don't.
let refreshedAt = 0;

/** Keeps the Inbox current: polls for changes while the tab is visible and refreshes in place. */
export function LiveUpdates() {
  const router = useRouter();
  const version = useRef<string | null>(null);
  const [state, setState] = useState<"live" | "updated" | "offline">("live");

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/seller/inbox", { cache: "no-store" });
          if (!res.ok) throw new Error(String(res.status));
          const { version: next } = (await res.json()) as { version: string };
          if (version.current && next !== version.current) {
            refreshedAt = Date.now();
            router.refresh();
            setState("updated");
            setTimeout(() => !stopped && setState("live"), 2500);
          } else {
            setState((s) => (s === "offline" ? "live" : s));
          }
          version.current = next;
        } catch {
          setState("offline");
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs opacity-70">
      <span className="relative flex size-2">
        {state !== "offline" && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
        )}
        <span className={`relative inline-flex size-2 rounded-full ${state === "offline" ? "bg-stone-400" : "bg-emerald-500"}`} />
      </span>
      {state === "updated" ? "Updated just now" : state === "offline" ? "Reconnecting…" : "Live"}
    </span>
  );
}

/** A list item that slides in with a short amber glow when it arrives through a live refresh. */
export function Arrive({ className, children, ...rest }: ComponentProps<typeof motion.li>) {
  const reduceMotion = useReducedMotion();
  const [isNew] = useState(() => Date.now() - refreshedAt < 3000);
  if (!isNew) return <li className={className as string}>{children as React.ReactNode}</li>;
  return (
    <motion.li
      {...rest}
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: -10, boxShadow: "0 0 0 0 rgba(245,158,11,0)" }}
      animate={{
        opacity: 1,
        y: 0,
        boxShadow: ["0 0 0 0 rgba(245,158,11,0)", "0 0 0 3px rgba(245,158,11,0.55)", "0 0 0 0 rgba(245,158,11,0)"],
      }}
      transition={{ duration: 0.35, ease: "easeOut", boxShadow: { duration: 2.2, times: [0, 0.15, 1] } }}
    >
      {children}
    </motion.li>
  );
}
