import { type NextRequest, NextResponse } from "next/server";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy
} from "@/lib/rate-limit/api-rate-limit";
import { verifyClerkToken } from "@/lib/auth/clerk-verifier";

function isPublicRoute(pathname: string): boolean {
  return (
    pathname === "/api/health" ||
    pathname === "/api/webhooks/twilio/inbound" ||
    pathname === "/api/webhooks/twilio/status"
  );
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Rate Limiting (only for API routes)
  let rateLimitHeaders: Record<string, string> = {};
  if (pathname.startsWith("/api/")) {
    const policy = getApiRateLimitPolicy();
    const result = await checkApiRateLimit({
      key: getApiRateLimitClientKey(request),
      policy
    });
    rateLimitHeaders = apiRateLimitHeaders(result) as Record<string, string>;

    if (!result.allowed) {
      return NextResponse.json(
        { error: "API rate limit exceeded.", retryAfterSeconds: result.retryAfterSeconds },
        { status: 429, headers: rateLimitHeaders }
      );
    }
  }

  // 2. Authentication (if enabled)
  if (process.env.PRODUCTION_AUTH_ENABLED === "true") {
    const isApiRoute = pathname.startsWith("/api/");
    const isGatedRoute = pathname.startsWith("/dashboard") || pathname.startsWith("/settings");

    if ((isApiRoute && !isPublicRoute(pathname)) || isGatedRoute) {
      let token: string | null = null;
      const authHeader = request.headers.get("authorization");
      if (authHeader?.startsWith("Bearer ")) {
        token = authHeader.substring(7);
      } else {
        const cookieHeader = request.headers.get("cookie");
        if (cookieHeader) {
          const match = cookieHeader.match(/(?:^|;)\s*__session\s*=\s*([^;]+)/);
          if (match) {
            token = match[1];
          }
        }
      }

      let isAuthenticated = false;
      if (token) {
        try {
          await verifyClerkToken(token);
          isAuthenticated = true;
        } catch {
          // Token is invalid/expired
        }
      }

      if (!isAuthenticated) {
        if (isApiRoute) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        } else {
          return NextResponse.redirect(new URL("/", request.url));
        }
      }
    }
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(rateLimitHeaders)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*", "/dashboard/:path*", "/settings/:path*", "/settings"]
};
