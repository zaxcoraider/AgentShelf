import type { Product, Seller } from "./db/schema";
import { shopPolicy } from "./shop-facts";

/**
 * AI readiness: can an assistant answer a shopper's questions about this shop without guessing?
 * Plain rules, not a model, so the result is instant and the same every time.
 *
 * "fix": a fact is missing, so an assistant would have to guess or say "I don't know".
 * "tip": answers are still right, but the listing could be better (photo, extra detail).
 */

export type Issue = { level: "fix" | "tip"; text: string };
export type ProductReport = { product: Product; issues: Issue[] };
export type Readiness = {
  ready: boolean;
  /** Share of checks passed, 0–100. */
  score: number;
  fixes: number;
  tips: number;
  shop: Issue[];
  products: ProductReport[];
};

function shopIssues(seller: Seller): Issue[] {
  const p = shopPolicy(seller);
  const issues: Issue[] = [];
  if (!p) {
    issues.push({ level: "fix", text: "No structured shop policy: assistants can't answer shipping or returns questions." });
    return issues;
  }
  if (!p.shipsTo.length) issues.push({ level: "fix", text: "No shipping countries listed: assistants can't say where you ship." });
  if (!p.shipsFrom.trim()) issues.push({ level: "fix", text: "Where orders ship from isn't set." });
  if (!p.materials.trim()) issues.push({ level: "fix", text: "Materials aren't listed: \"what's it made of?\" has no answer." });
  if (!p.damaged.trim()) issues.push({ level: "fix", text: "No policy for items damaged in transit." });
  if (!seller.tagline) issues.push({ level: "tip", text: "Add a one-line tagline so assistants can introduce your shop." });
  return issues;
}

function productIssues(product: Product): Issue[] {
  const a = product.attributes;
  const issues: Issue[] = [];
  const words = product.description.trim().split(/\s+/).length;
  if (words < 8) issues.push({ level: "fix", text: "Description is too short for an assistant to describe it." });
  else if (words < 20) issues.push({ level: "tip", text: "A longer description (20+ words) gives assistants more to work with." });
  if (!a.size) issues.push({ level: "fix", text: "No size listed: \"how big is it?\" has no answer." });
  if (!a.scent) issues.push({ level: "tip", text: "No scent notes listed." });
  if (!a.burnTime) issues.push({ level: "tip", text: "No burn time listed." });
  if (!product.imageUrl) issues.push({ level: "tip", text: "No photo: product cards in Claude and ChatGPT show a placeholder." });
  if (product.stock <= 0) issues.push({ level: "tip", text: "Sold out: assistants will say so and won't check out." });
  return issues;
}

// How many checks each part runs, for the score.
const SHOP_CHECKS = 6;
const PRODUCT_CHECKS = 6;

export function readiness(seller: Seller, products: Product[]): Readiness {
  const shop = shopIssues(seller);
  const reports = products.map((product) => ({ product, issues: productIssues(product) }));
  const all = [...shop, ...reports.flatMap((r) => r.issues)];
  const fixes = all.filter((i) => i.level === "fix").length;
  const total = SHOP_CHECKS + PRODUCT_CHECKS * products.length;
  return {
    ready: fixes === 0 && products.length > 0,
    score: Math.max(0, Math.round(((total - all.length) / total) * 100)),
    fixes,
    tips: all.length - fixes,
    shop,
    products: reports.sort((x, y) => rank(y.issues) - rank(x.issues)),
  };
}

// Products that need fixing first, then the ones with tips.
const rank = (issues: Issue[]) => issues.filter((i) => i.level === "fix").length * 100 + issues.length;
