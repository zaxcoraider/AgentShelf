import type { Seller, ShopPolicy } from "./db/schema";
import { usd } from "./money";

/**
 * The single source of truth for what a shop promises: shipping, returns, materials.
 * Everything that states these facts (ask_seller, the seller agent, listing drafts, the MCP server,
 * storefront JSON-LD, llms.txt, the storefront itself) reads them from here, so humans and AI
 * assistants always get the same answer, and "no" is stated as plainly as "yes".
 */

const COUNTRY = new Intl.DisplayNames(["en"], { type: "region" });
const countryName = (code: string) => {
  try {
    return COUNTRY.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "the United States", "the Netherlands"; plain "Canada".
const withThe = (name: string) => (/^(United|Netherlands|Philippines|Czech|Dominican|Bahamas)/.test(name) ? `the ${name}` : name);
const range = ({ min, max }: { min: number; max: number }) => (min === max ? `${min}` : `${min}-${max}`);

export type { ShopPolicy };

export function shopPolicy(seller: Seller): ShopPolicy | null {
  return seller.shopPolicy ?? null;
}

/** The policy as short, unambiguous sentences, in the same order everywhere. */
export function policyLines(seller: Seller): string[] {
  const p = shopPolicy(seller);
  if (!p) return seller.policy ? seller.policy.split("\n").filter(Boolean) : [];
  const countries = p.shipsTo.map((c) => withThe(countryName(c)));
  const lines = [
    `Ships from ${p.shipsFrom}.`,
    p.shipsTo.length === 1
      ? `Ships only within ${countries[0]}. Does not ship to any other country.`
      : `Ships to: ${countries.join(", ")}. Does not ship to any other country.`,
    `Orders ship within ${range(p.processingDays)} business days via ${p.carrier}, then take ${range(p.transitDays)} business days to arrive.`,
    `Shipping is a flat ${usd(p.shippingCents)} per order.`,
    p.returnsDays > 0
      ? `Returns accepted within ${p.returnsDays} days of delivery if ${p.returnsCondition}. Return shipping is paid by the ${p.returnShippingPaidBy}.`
      : "No returns.",
    `Damaged in transit: ${cap(p.damaged)}`,
    `Materials: ${cap(p.materials)}`,
    p.customOrders ? `Custom orders: ${cap(p.customOrders)}` : "No custom orders.",
  ];
  return seller.policy ? [...lines, ...seller.policy.split("\n").filter(Boolean)] : lines;
}

/** For prompts: the policy block, or a clear note that there isn't one. */
export function policyText(seller: Seller) {
  const lines = policyLines(seller);
  return lines.length ? lines.map((l) => `- ${l}`).join("\n") : "No policy written yet.";
}

/** For AI assistants (MCP): the same facts as data, plus the sentences. */
export function publicPolicy(seller: Seller) {
  const p = shopPolicy(seller);
  return {
    shop: seller.name,
    summary: policyLines(seller),
    ...(p && {
      shipping: {
        shipsFrom: p.shipsFrom,
        shipsToCountries: p.shipsTo,
        international: p.shipsTo.length > 1,
        processingBusinessDays: p.processingDays,
        carrier: p.carrier,
        transitBusinessDays: p.transitDays,
        flatRate: usd(p.shippingCents),
      },
      returns: {
        accepted: p.returnsDays > 0,
        windowDays: p.returnsDays,
        condition: p.returnsCondition,
        returnShippingPaidBy: p.returnShippingPaidBy,
        damagedInTransit: p.damaged,
      },
      materials: p.materials,
      customOrders: p.customOrders,
    }),
  };
}

/** schema.org Product + Offer JSON-LD for one product, with the shop's shipping and returns. */
export function productJsonLd(
  seller: Seller,
  product: { id: string; title: string; description: string; priceCents: number; stock: number; imageUrl: string | null; attributes: Record<string, string> },
  baseUrl: string,
) {
  const p = shopPolicy(seller);
  const shopUrl = `${baseUrl}/shop/${seller.slug}`;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${shopUrl}#${product.id}`,
    sku: product.id,
    name: product.title,
    description: product.description,
    ...(product.imageUrl && { image: new URL(product.imageUrl, baseUrl).href }),
    brand: { "@type": "Brand", name: seller.name },
    ...(product.attributes.wax && { material: product.attributes.wax }),
    additionalProperty: Object.entries(product.attributes).map(([name, value]) => ({ "@type": "PropertyValue", name, value })),
    offers: {
      "@type": "Offer",
      url: shopUrl,
      price: (product.priceCents / 100).toFixed(2),
      priceCurrency: "USD",
      availability: product.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: seller.name },
      ...(p && {
        shippingDetails: {
          "@type": "OfferShippingDetails",
          shippingRate: { "@type": "MonetaryAmount", value: (p.shippingCents / 100).toFixed(2), currency: "USD" },
          shippingDestination: p.shipsTo.map((addressCountry) => ({ "@type": "DefinedRegion", addressCountry })),
          deliveryTime: {
            "@type": "ShippingDeliveryTime",
            handlingTime: { "@type": "QuantitativeValue", minValue: p.processingDays.min, maxValue: p.processingDays.max, unitCode: "DAY" },
            transitTime: { "@type": "QuantitativeValue", minValue: p.transitDays.min, maxValue: p.transitDays.max, unitCode: "DAY" },
          },
        },
        hasMerchantReturnPolicy: {
          "@type": "MerchantReturnPolicy",
          applicableCountry: p.shipsTo,
          ...(p.returnsDays > 0
            ? {
                returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
                merchantReturnDays: p.returnsDays,
                returnFees:
                  p.returnShippingPaidBy === "seller" ? "https://schema.org/FreeReturn" : "https://schema.org/ReturnShippingFees",
              }
            : { returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted" }),
        },
      }),
    },
  };
}
