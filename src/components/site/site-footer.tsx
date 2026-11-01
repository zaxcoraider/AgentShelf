import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { DEVPOST_URL, FOOTER_COLUMNS, REPO_URL } from "./nav-links";

/**
 * The site footer. "full" (home, /start, /signin, /judges): a column per kind of visitor (shopper,
 * seller, judge, developer). "slim" (storefront, checkout, seller app): one quiet row of the key links.
 * `tone="light"` matches the warm storefront; the default is the candlelit dark.
 */
export function SiteFooter({
  variant = "full",
  tone = "dark",
  width = "max-w-6xl",
}: {
  variant?: "full" | "slim";
  tone?: "dark" | "light";
  /** Match the page's content width (the seller app is narrower). */
  width?: "max-w-6xl" | "max-w-5xl";
}) {
  const t =
    tone === "light"
      ? { border: "border-stone-900/[0.07]", muted: "text-stone-500", link: "text-stone-500 hover:text-stone-900", strong: "text-stone-900" }
      : { border: "border-white/[0.06]", muted: "text-smoke", link: "text-smoke hover:text-cream", strong: "text-cream" };
  const year = 2026;

  if (variant === "slim") {
    const links: [string, string][] = [
      ["Home", "/"],
      ["Create your shop", "/start"],
      ["Seller sign-in", "/signin"],
      ["For judges", "/judges"],
      ["GitHub", REPO_URL],
    ];
    return (
      <footer className={`border-t ${t.border}`}>
        <div className={`mx-auto flex ${width} flex-col gap-4 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6`}>
          <Link href="/" className={`inline-flex items-center gap-2 transition-colors ${t.link}`}>
            <LogoMark size={18} />
            <span>
              AgentShelf <span className="opacity-70">· PayPal sandbox demo</span>
            </span>
          </Link>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {links.map(([label, href]) => (
                <li key={href}>
                  <FooterLink href={href} className={`transition-colors ${t.link}`}>
                    {label}
                  </FooterLink>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className={`border-t ${t.border}`}>
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-10 text-sm sm:px-6 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
        <div className="max-w-xs">
          <Link href="/" aria-label="AgentShelf home" className={t.strong}>
            <Logo />
          </Link>
          <p className={`mt-4 leading-relaxed ${t.muted}`}>
            Your shop, buyable by AI assistants. Checkout with PayPal, after-sale handled by your own agent.
          </p>
        </div>
        <nav aria-label="Footer" className="contents">
          {FOOTER_COLUMNS.map((col) => (
            <div key={col.title}>
              <p className={`font-medium ${t.strong}`}>{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map(([label, href]) => (
                  <li key={href}>
                    <FooterLink href={href} className={`transition-colors ${t.link}`}>
                      {label}
                    </FooterLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className={`border-t ${t.border}`}>
        <div className={`mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs sm:flex-row sm:justify-between sm:px-6 ${t.muted}`}>
          <p>
            © {year} AgentShelf · MIT licence · Built for{" "}
            <a href={DEVPOST_URL} className={`underline-offset-2 hover:underline ${t.strong}`}>
              Build What&apos;s Next with PayPal and AI
            </a>
          </p>
          <p className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-amber-400" aria-hidden />
            Sandbox only: no real money moves.
          </p>
        </div>
      </div>
    </footer>
  );
}

/** Internal links stay client-side; external ones open normally. */
function FooterLink({ href, className, children }: { href: string; className: string; children: React.ReactNode }) {
  return href.startsWith("http") ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
