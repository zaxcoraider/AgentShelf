import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, sellerAuthEnabled, verifySessionToken } from "@/lib/session";

// Seller pages need the demo sign-in when SELLER_DEMO_PASSWORD is set. Server actions also
// check the session themselves (requireSeller), since an action can be posted to any URL.
export async function middleware(request: NextRequest) {
  if (!sellerAuthEnabled()) return NextResponse.next();
  if (await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const signIn = new URL("/signin", request.url);
  signIn.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signIn);
}

export const config = { matcher: ["/seller/:path*"] };
