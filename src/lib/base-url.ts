import { headers } from "next/headers";
import { appUrl } from "./shop";

/** The address the current page was opened on, so URLs we show actually reach this server. */
export async function requestBaseUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return appUrl();
  const proto = h.get("x-forwarded-proto")?.split(",")[0] ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
