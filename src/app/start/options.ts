/** Shared between the /start form and its action (kept out of the "use server" file). */

export const SHIP_TO = {
  us: ["US"],
  "us-ca": ["US", "CA"],
  "us-ca-uk-au": ["US", "CA", "GB", "AU"],
} as const satisfies Record<string, string[]>;

/** What a new shop sells: picks its sample products (and "other" means none). */
export const SHOP_KINDS = [
  { id: "ceramics", label: "Ceramics" },
  { id: "prints", label: "Prints & art" },
  { id: "jewelry", label: "Jewelry" },
  { id: "candles", label: "Candles" },
  { id: "other", label: "Something else" },
] as const;
export type ShopKind = (typeof SHOP_KINDS)[number]["id"];

export const START_LIMITS = {
  perVisitorPerDay: 3,
  sitePerDay: 100,
  /** Visitor shops (and everything in them) are deleted after this many days. */
  shopDays: 30,
  /** Products a visitor shop may list. */
  maxProducts: 20,
};

/** `values` echoes what was typed (never the password), since React resets the form after an action. */
export type CreateShopState = { message: string; errors?: Record<string, string>; values?: Record<string, string> } | null;
