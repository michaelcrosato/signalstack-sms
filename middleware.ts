import { NextRequest, NextResponse } from "next/server";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy
} from "@/lib/rate-limit/api-rate-limit";

export async function middleware(request: NextRequest) {
  // /api/v1 consumes an authoritative PostgreSQL bucket keyed by the resolved API credential before
  // route body parsing. The legacy IP/process limiter has a different identity and response contract,
  // so it must not preempt the versioned boundary.
  if (request.nextUrl.pathname === "/api/v1" || request.nextUrl.pathname.startsWith("/api/v1/")) {
    return NextResponse.next();
  }

  const policy = getApiRateLimitPolicy();
  const result = await checkApiRateLimit({
    key: getApiRateLimitClientKey(request),
    policy
  });
  const headers = apiRateLimitHeaders(result);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded.", retryAfterSeconds: result.retryAfterSeconds },
      { status: 429, headers }
    );
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
}

export const config = {
  matcher: ["/api/:path*"]
};
