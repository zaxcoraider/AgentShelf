"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

const dollars = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** A number that counts up once when it scrolls into view. */
export function CountUp({ to, format = "plain" }: { to: number; format?: "plain" | "percent" | "usd" }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduceMotion = useReducedMotion();
  const [value, setValue] = useState(reduceMotion ? to : 0);

  useEffect(() => {
    if (!inView || reduceMotion) return setValue(to);
    const controls = animate(0, to, { duration: 1.4, ease: [0.16, 1, 0.3, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [inView, reduceMotion, to]);

  const n = Math.round(value);
  const text = format === "usd" ? dollars.format(n) : format === "percent" ? `${n}%` : String(n);
  return <span ref={ref}>{text}</span>;
}
