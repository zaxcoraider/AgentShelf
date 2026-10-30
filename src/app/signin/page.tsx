import Link from "next/link";
import { redirect } from "next/navigation";
import { sellerAuthEnabled } from "@/lib/session";
import { SignInForm } from "./form";

// Demo sign-in for the seller side (Maya of Maya's Candles).
export const dynamic = "force-dynamic";

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!sellerAuthEnabled()) redirect("/seller/inbox");
  const { next } = await searchParams;
  return (
    <main className="mx-auto max-w-sm px-4 py-16">
      <Link href="/" className="text-sm font-semibold">
        AgentShelf
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Seller sign-in</h1>
      <p className="mt-1 text-sm opacity-70">
        You&apos;re signing in as Maya, owner of the demo shop. Judges: the password is in the Devpost submission.
      </p>
      <SignInForm next={next} />
      <p className="mt-6 text-sm opacity-70">
        Just want to shop?{" "}
        <Link href="/shop/mayas-candles" className="underline">
          Visit the storefront
        </Link>
        , no sign-in needed.
      </p>
    </main>
  );
}
