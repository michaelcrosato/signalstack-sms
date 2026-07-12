import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/logger";

/**
 * Map an unexpected AI route failure to a response. These endpoints resolve the provider without
 * throwing (the hard gate returns the fake provider when live AI is disabled), so a thrown error is an
 * upstream/live-provider or internal failure — a 502, not an authorization block. The raw message is
 * logged, never returned, so provider/DB internals do not leak to callers.
 */
export function aiRouteErrorResponse(scope: string, error: unknown): NextResponse {
  logger.error("ai_route_failed", {
    scope,
    errorType: error instanceof Error ? error.name : "unknown",
    message: error instanceof Error ? error.message : String(error)
  });
  return NextResponse.json(
    { error: "AI provider is temporarily unavailable." },
    { status: 502 }
  );
}
