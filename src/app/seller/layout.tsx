import Link from "next/link";
import { signOut } from "@/app/signin/actions";
import { DEMO_SELLER_SLUG } from "@/lib/seller";
import { sellerAuthEnabled } from "@/lib/session";

// Shared nav for the seller's pages.
const LINKS = [
  { href: "/seller/inbox", label: "Inbox" },
  { href: "/seller/listings", label: "Add products" },
  { href: "/seller/connect", label: "Connect your AI" },
  { href: `/shop/${DEMO_SELLER_SLUG}`, label: "Storefront" },
];

export default function SellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <nav className="border-b border-stone-200 dark:border-stone-800">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-5 gap-y-1 px-4 py-3 text-sm sm:px-6">
          <Link href="/" className="font-semibold">
            AgentShelf
          </Link>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="opacity-70 transition-opacity hover:opacity-100">
              {l.label}
            </Link>
          ))}
          {sellerAuthEnabled() && (
            <form action={signOut} className="ml-auto">
              <button className="opacity-70 transition-opacity hover:opacity-100">Sign out</button>
            </form>
          )}
        </div>
      </nav>
      {children}
    </>
  );
}
