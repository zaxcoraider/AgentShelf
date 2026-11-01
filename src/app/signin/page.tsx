import Link from "next/link";
import { redirect } from "next/navigation";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { knownShops } from "@/lib/seller-auth";
import { sellerAuthEnabled } from "@/lib/session";
import { SignInForm } from "./form";

// Seller sign-in: the showcase shop (Maya's Candles) or a shop made on /start.
export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; shop?: string }> }) {
  const { next, shop } = await searchParams;
  if (!sellerAuthEnabled() && !shop) redirect("/seller/inbox");
  return (
    <div className="dark relative flex min-h-screen flex-col overflow-x-clip bg-wax text-cream [color-scheme:dark]">
      <SiteHeader current="/signin" />
      <div className="relative flex flex-1 items-center justify-center px-4 py-16">
      <div
        aria-hidden
        className="candle-glow pointer-events-none absolute left-1/2 top-1/2 size-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.14),transparent)]"
      />
      <main className="relative w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] backdrop-blur-md">
          <h1 className="text-2xl font-semibold tracking-tight">Seller sign-in</h1>
          <p className="mt-1 text-sm text-smoke">
            Sign in to Maya&apos;s Candles, the demo shop (judges: the password is in the Devpost submission), or to a
            shop you created.
          </p>
          <SignInForm next={next} shop={shop} known={await knownShops()} />
        </div>
        <p className="mt-6 text-sm text-smoke">
          No shop yet?{" "}
          <Link href="/start" className="text-cream underline underline-offset-2">
            Create your own
          </Link>{" "}
          in a minute.
        </p>
        <p className="mt-2 text-sm text-smoke">
          Just want to shop?{" "}
          <Link href="/shop/mayas-candles" className="text-cream underline underline-offset-2">
            Visit the storefront
          </Link>
          , no sign-in needed.
        </p>
      </main>
      </div>
      <SiteFooter variant="slim" />
    </div>
  );
}
