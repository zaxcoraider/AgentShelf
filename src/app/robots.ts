import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/shop";

/** Storefronts and guides are public; the seller app, sign-in and APIs are not for crawlers. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/seller", "/signin", "/api/", "/checkout/"] },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
