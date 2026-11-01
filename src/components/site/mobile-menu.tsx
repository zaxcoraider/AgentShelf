"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** The header's links on small screens: a button that opens a full-width panel under the header. */
export function MobileMenu({ links, current }: { links: { label: string; href: string }[]; current?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation and on Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((o) => !o)}
        className="grid size-9 place-items-center rounded-full text-cream transition-colors hover:bg-white/[0.06]"
      >
        <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          {open ? <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" /> : <path d="M3.5 6.5h13M3.5 13.5h13" strokeLinecap="round" />}
        </svg>
      </button>
      {open && (
        <div id="mobile-menu" className="absolute inset-x-0 top-16 h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/[0.06] bg-wax shadow-[0_24px_48px_-12px_rgba(0,0,0,0.6)]">
          <ul className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  aria-current={current === l.href ? "page" : undefined}
                  className={`block rounded-xl px-3 py-3 text-base transition-colors ${
                    current === l.href ? "bg-white/[0.06] text-cream" : "text-smoke hover:bg-white/[0.04] hover:text-cream"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
