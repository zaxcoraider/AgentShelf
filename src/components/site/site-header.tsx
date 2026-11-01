import Link from "next/link";
import { Logo } from "@/components/logo";
import { MobileMenu } from "./mobile-menu";
import { HEADER_LINKS } from "./nav-links";

/**
 * The public site's header (home, /start, /signin, /judges): where to go as a buyer, a seller,
 * or a judge, plus the two actions that matter most. Sticky, glassy, candlelit like the landing.
 */
export function SiteHeader({ current }: { current?: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-wax/75 backdrop-blur-xl">
      <nav aria-label="Main" className="mx-auto flex h-16 max-w-6xl items-center gap-8 px-4 text-sm sm:px-6">
        <Link href="/" aria-label="AgentShelf home" className="shrink-0">
          <Logo />
        </Link>
        <ul className="hidden items-center gap-1 lg:flex">
          {HEADER_LINKS.map((l) => {
            const active = current === l.href;
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    active ? "bg-white/[0.07] text-cream" : "text-smoke hover:text-cream"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/signin"
            className={`hidden rounded-full px-3 py-1.5 transition-colors sm:block ${
              current === "/signin" ? "text-cream" : "text-smoke hover:text-cream"
            }`}
          >
            Seller sign-in
          </Link>
          {current !== "/start" && (
            <Link href="/start" className="rounded-full bg-cream px-4 py-1.5 font-medium text-wax transition hover:bg-white">
              Create your shop
            </Link>
          )}
          <MobileMenu links={[...HEADER_LINKS, { label: "Seller sign-in", href: "/signin" }]} current={current} />
        </div>
      </nav>
    </header>
  );
}
