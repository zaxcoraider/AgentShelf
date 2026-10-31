import Link from "next/link";
import { signOut } from "@/app/signin/actions";
import { Logo } from "@/components/logo";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { sellerAuthEnabled } from "@/lib/session";
import { SellerNavLinks } from "./nav";

// Shared shell for the seller's pages: the landing page's candlelit look, always dark.
const LINKS = [
  { href: "/seller/inbox", label: "Inbox" },
  { href: "/seller/dashboard", label: "Dashboard" },
  { href: "/seller/listings", label: "Add products" },
  { href: "/seller/ai-view", label: "AI's view" },
  { href: "/seller/connect", label: "Connect your AI" },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dark min-h-screen bg-wax text-cream [color-scheme:dark] selection:bg-ember/40">
      {/* A low, warm light at the top of every page, like the landing hero. */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_60%_100%_at_50%_0%,rgba(245,158,11,0.10),transparent)]"
      />
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-wax/70 backdrop-blur-xl">
        <nav className="mx-auto flex h-14 max-w-5xl items-center gap-4 px-4 text-sm sm:px-6">
          <Link href="/" aria-label="AgentShelf home" className="shrink-0">
            <Logo size={24} />
          </Link>
          <SellerNavLinks links={LINKS} />
          <div className="ml-auto flex shrink-0 items-center gap-4 text-smoke">
            <Link href={`/shop/${DEMO_SELLER_SLUG}`} className="hidden transition-colors hover:text-cream sm:block">
              Storefront
            </Link>
            {sellerAuthEnabled() && (
              <form action={signOut}>
                <button className="transition-colors hover:text-cream">Sign out</button>
              </form>
            )}
          </div>
        </nav>
      </header>
      <div className="relative">{children}</div>
    </div>
  );
}
