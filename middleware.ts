import { NextResponse } from "next/server";
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import {
  apiRateLimitHeaders,
  checkApiRateLimit,
  getApiRateLimitClientKey,
  getApiRateLimitPolicy
} from "@/lib/rate-limit/api-rate-limit";

const isProtectedRoute = createRouteMatcher(["/dashboard(.*)", "/settings(.*)"]);
const isApiRoute = createRouteMatcher(["/api(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  const response = NextResponse.next();

  if (isApiRoute(request)) {
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

    for (const [key, value] of Object.entries(headers)) {
      response.headers.set(key, value);
    }
  }

  if (process.env.PRODUCTION_AUTH_ENABLED === "true" && isProtectedRoute(request)) {
    const session = await auth();
    if (!session.userId) {
      return new NextResponse(null, { status: 401 });
    }
  }

  return response;
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)"
  ]
};
