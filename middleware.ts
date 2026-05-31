import { NextResponse } from "next/server";
import { clerkMiddleware } from "@clerk/nextjs/server";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy
} from "@/lib/rate-limit/api-rate-limit";

export default clerkMiddleware(async (auth, request) => {
  const policy = getApiRateLimitPolicy();
  const result = await checkApiRateLimit({
    key: getApiRateLimitClientKey(request.headers),
    policy
  });
  const headers = apiRateLimitHeaders(result);

  if (!result.allowed) {
    return NextResponse.json(
      { error: "API rate limit exceeded.", retryAfterSeconds: result.retryAfterSeconds },
      { status: 429, headers }
    );
  }

  if (process.env.PRODUCTION_AUTH_ENABLED === "true") {
    await auth.protect();
  }

  const response = NextResponse.next();
  for (const [key, value] of Object.entries(headers)) {
    response.headers.set(key, value);
  }

  return response;
});

export const config = {
  matcher: ["/api/:path*"]
};
