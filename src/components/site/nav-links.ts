import { DEMO_SELLER_SLUG } from "@/lib/seller-slug";

/** One source for the site's navigation, shared by the header, the mobile menu and the footer. */

export const REPO_URL = "https://github.com/zaxcoraider/AgentShelf";
export const DEVPOST_URL = "https://paypalaihackathon.devpost.com";
export const DEMO_SHOP = `/shop/${DEMO_SELLER_SLUG}`;

export const HEADER_LINKS: { label: string; href: string }[] = [
  { label: "How it works", href: "/#how" },
  { label: "Demo shop", href: DEMO_SHOP },
  { label: "For judges", href: "/judges" },
  { label: "Developers", href: "/#developers" },
];

export const FOOTER_COLUMNS: { title: string; links: [label: string, href: string][] }[] = [
  {
    title: "Shop",
    links: [
      ["Maya's Candles (demo)", DEMO_SHOP],
      ["How AI checkout works", "/#how"],
      ["What AI assistants see", "/llms.txt"],
    ],
  },
  {
    title: "Sell",
    links: [
      ["Create your shop", "/start"],
      ["Seller sign-in", "/signin"],
      ["Connect your AI", "/seller/connect"],
      ["Add products from photos", "/seller/listings"],
    ],
  },
  {
    title: "Judges",
    links: [
      ["Judge's guide", "/judges"],
      ["AG Studio dashboard", "/seller/dashboard"],
      ["PayPal APIs used", `${REPO_URL}#paypal-apis-and-sdks-used`],
      ["Devpost", DEVPOST_URL],
    ],
  },
  {
    title: "Developers",
    links: [
      ["MCP connectors", "/#developers"],
      ["llms.txt", "/llms.txt"],
      ["Source on GitHub", REPO_URL],
    ],
  },
];
