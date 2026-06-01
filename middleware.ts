import { NextRequest, NextResponse } from "next/server";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy
} from "@/lib/rate-limit/api-rate-limit";

export async function middleware(request: NextRequest) {
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
