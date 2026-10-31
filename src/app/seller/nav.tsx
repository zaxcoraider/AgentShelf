"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Seller nav links, with the current page marked. */
export function SellerNavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <div className="-mx-1 flex min-w-0 items-center gap-1 overflow-x-auto">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1.5 transition-colors ${
              active ? "bg-white/[0.08] text-cream" : "text-smoke hover:text-cream"
            }`}
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}
