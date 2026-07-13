import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { listDeliveryAttempts } from "@/lib/messaging/delivery-attempt-review";
import { deliveryAttemptReviewQuerySchema } from "@/lib/validation/delivery-attempts";
import {
  deliveryAttemptJson,
  deliveryAttemptRouteError,
  withDeliveryAttemptNoStore
} from "./_shared";

const allowedQueryKeys = new Set([
  "applicationStatus",
  "attemptStatus",
  "requiresReview",
  "cursor",
  "limit"
]);

export async function GET(request: Request) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) return withDeliveryAttemptNoStore(authentication.response);
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return withDeliveryAttemptNoStore(roleResponse);

  const url = new URL(request.url);
  if (
    Array.from(url.searchParams.keys()).some((key) => !allowedQueryKeys.has(key)) ||
    Array.from(allowedQueryKeys).some((key) => url.searchParams.getAll(key).length > 1)
  ) {
    return deliveryAttemptJson(
      { error: "Delivery attempt request is invalid.", code: "DELIVERY_ATTEMPT_INVALID" },
      400
    );
  }
  const parsed = deliveryAttemptReviewQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries())
  );
  if (!parsed.success) {
    return deliveryAttemptJson(
      { error: "Delivery attempt request is invalid.", code: "DELIVERY_ATTEMPT_INVALID" },
      400
    );
  }

  try {
    return deliveryAttemptJson(await listDeliveryAttempts(currentOrg.orgId, parsed.data));
  } catch (error) {
    return deliveryAttemptRouteError(error);
  }
}
