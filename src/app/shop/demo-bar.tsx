import Link from "next/link";
import { LogoMark } from "@/components/logo";

/**
 * AgentShelf's own strip above a shop (like a hosted-store preview bar): the way back to the
 * AgentShelf site, a plain note that this is a sandbox demo, and the seller side of the demo.
 * Dark on purpose, so it reads as platform chrome rather than part of the seller's shop.
 */
export function DemoBar({ sellerHref = "/seller/inbox" }: { sellerHref?: string }) {
  return (
    <div className="bg-[#17130f] text-[13px] text-stone-300">
      <div className="mx-auto flex h-10 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="group inline-flex items-center gap-2 rounded-full py-1 pr-2 text-stone-200 transition-colors hover:text-white"
        >
          <span aria-hidden className="transition-transform group-hover:-translate-x-0.5">
            ←
          </span>
          <LogoMark size={18} />
          <span className="font-medium">AgentShelf</span>
        </Link>
        <p className="hidden items-center gap-2 text-stone-400 sm:inline-flex">
          <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
          Demo shop · payments run in the PayPal sandbox
        </p>
        <Link
          href={sellerHref}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-stone-200 transition-colors hover:border-white/25 hover:text-white"
        >
          Seller dashboard <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
