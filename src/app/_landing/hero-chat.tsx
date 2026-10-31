"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

export type HeroProduct = {
  title: string;
  price: string;
  imageUrl: string | null;
  details: string;
};

type Props = {
  shopName: string;
  product: HeroProduct;
  /** What the seller's data says about the wax, so the demo answer is grounded in the real shop. */
  waxAnswer: string;
};

// How long each beat of the conversation holds before the next one appears (ms).
const BEATS = [2600, 1500, 1700, 1400, 1800, 1300, 1900, 1400, 5200];
const LAST = BEATS.length - 1;

/** The landing hero: an AI assistant finds a candle, asks the seller, and checks out with PayPal. Loops. */
export function HeroChat({ shopName, product, waxAnswer }: Props) {
  const reduceMotion = useReducedMotion();
  const prompt = `Find me a cozy candle under $30 from ${shopName}. Is it soy wax? If so, buy it.`;
  const [step, setStep] = useState(0);
  const [typed, setTyped] = useState(0);
  const [round, setRound] = useState(0);

  // Type the shopper's message, then walk through the beats and start over.
  useEffect(() => {
    if (reduceMotion) return;
    if (step === 0 && typed < prompt.length) {
      const t = setTimeout(() => setTyped((n) => n + 1), 28);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      if (step === LAST) {
        setTyped(0);
        setRound((r) => r + 1);
      }
      setStep((s) => (s === LAST ? 0 : s + 1));
    }, BEATS[step]);
    return () => clearTimeout(t);
  }, [step, typed, prompt.length, reduceMotion]);

  const at = reduceMotion ? LAST : step;
  const shown = reduceMotion ? prompt : prompt.slice(0, typed);

  return (
    <div className="relative">
      {/* The candle the whole page is lit by. */}
      <div
        aria-hidden
        className="candle-glow pointer-events-none absolute -inset-16 rounded-full bg-[radial-gradient(closest-side,rgba(245,158,11,0.22),rgba(245,158,11,0.06)_55%,transparent)] blur-2xl"
      />
      <div
        role="img"
        aria-label={`Demo: an AI assistant finds ${product.title} at ${shopName}, asks the seller about the wax, and pays with PayPal.`}
        className="relative flex h-[32rem] flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#120f0c]/90 shadow-[0_40px_120px_-30px_rgba(245,158,11,0.35)] ring-1 ring-black/40 backdrop-blur-md"
      >
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-5 py-3.5 text-sm">
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          <span className="font-medium whitespace-nowrap text-cream">Your AI assistant</span>
          <span className="ml-auto hidden truncate font-mono text-xs text-smoke sm:inline">connected to {shopName}</span>
        </div>

        <div className="flex flex-1 flex-col justify-end gap-3 overflow-hidden p-5 text-sm [mask-image:linear-gradient(to_bottom,transparent,black_22%)]" aria-hidden>
          <AnimatePresence initial={false} mode="popLayout">
            <Bubble key={`you-${round}`} side="right">
              {shown}
              {at === 0 && shown.length < prompt.length && <Caret />}
            </Bubble>

            {at >= 1 && (
              <ToolCall key="search" done={at >= 2} label={`search_products`} result="3 candles under $30" />
            )}
            {at >= 2 && (
              <Bubble key="pick" side="left">
                <p>This one sounds cozy:</p>
                <ProductCard product={product} />
              </Bubble>
            )}
            {at >= 3 && <ToolCall key="ask" done={at >= 4} label="ask_seller" result="“Is it soy wax?”" />}
            {at >= 4 && (
              <Bubble key="seller" side="left" from={shopName}>
                {waxAnswer}
              </Bubble>
            )}
            {at >= 5 && <ToolCall key="checkout" done={at >= 6} label="create_checkout" result={`PayPal order, ${product.price}`} />}
            {at >= 6 && (
              <Bubble key="pay" side="left">
                <p>Soy wax, under budget. Approve the payment and it&apos;s yours:</p>
                <PayButton pressed={at >= 7} />
              </Bubble>
            )}
            {at >= 8 && (
              <motion.div
                key="paid"
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
                className="self-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-xs text-emerald-300"
              >
                ✓ Paid {product.price}. The seller&apos;s agent adds tracking when it ships.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

const enter = {
  layout: true,
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { duration: 0.3, ease: "easeOut" },
} as const;

function Bubble({ side, from, children }: { side: "left" | "right"; from?: string; children: React.ReactNode }) {
  return (
    <motion.div {...enter} className={`max-w-[85%] ${side === "right" ? "self-end" : "self-start"}`}>
      {from && <p className="mb-1 text-xs text-ember">{from}</p>}
      <div
        className={`rounded-2xl px-4 py-2.5 leading-relaxed ${
          side === "right" ? "rounded-br-md bg-cream text-wax" : "rounded-bl-md border border-white/[0.07] bg-white/[0.04] text-cream"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}

function ToolCall({ label, result, done }: { label: string; result: string; done: boolean }) {
  return (
    <motion.div {...enter} className="flex items-center gap-2 self-start font-mono text-xs text-smoke">
      {done ? (
        <span className="text-ember">✓</span>
      ) : (
        <motion.span
          className="inline-block size-3 rounded-full border-2 border-ember border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
        />
      )}
      <span className="text-cream/80">{label}</span>
      {done && <span>{result}</span>}
    </motion.div>
  );
}

function ProductCard({ product }: { product: HeroProduct }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-xl bg-wax/60 p-2">
      {product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- photos are served from our own DB route
        <img src={product.imageUrl} alt="" className="size-14 rounded-lg object-cover" />
      ) : (
        <CandleIcon />
      )}
      <div className="min-w-0">
        <p className="truncate font-medium">{product.title}</p>
        <p className="flex gap-2 text-xs text-smoke">
          <span className="font-medium text-flame">{product.price}</span>
          <span className="truncate">{product.details}</span>
        </p>
      </div>
    </div>
  );
}

function PayButton({ pressed }: { pressed: boolean }) {
  return (
    <motion.div
      animate={pressed ? { scale: [1, 0.94, 1] } : { scale: 1 }}
      transition={{ duration: 0.35 }}
      className="mt-2 rounded-full bg-[#ffc439] py-2 text-center text-sm font-semibold text-[#142c8e]"
    >
      {pressed ? "Approving…" : "Pay with PayPal"}
    </motion.div>
  );
}

function Caret() {
  return (
    <motion.span
      className="ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-wax"
      animate={{ opacity: [1, 0, 1] }}
      transition={{ repeat: Infinity, duration: 0.9 }}
    />
  );
}

function CandleIcon() {
  return (
    <svg viewBox="0 0 56 56" className="size-14 shrink-0 rounded-lg bg-soot" aria-hidden>
      <path d="M28 10 c4 6 5 9 0 14 c-5 -5 -4 -8 0 -14 Z" fill="#fcd34d" />
      <rect x="19" y="26" width="18" height="22" rx="3" fill="#faf7f2" />
    </svg>
  );
}
