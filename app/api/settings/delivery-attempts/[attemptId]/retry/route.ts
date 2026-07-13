import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { retryAttestedDeliveryAttempt } from "@/lib/messaging/delivery-attempt-review";
import {
  deliveryAttemptIdSchema,
  deliveryAttemptRetrySchema
} from "@/lib/validation/delivery-attempts";
import {
  deliveryAttemptJson,
  deliveryAttemptRouteError,
  parseDeliveryAttemptJson,
  requireDeliveryAttemptMutationOrigin,
  withDeliveryAttemptNoStore
} from "../../_shared";

type AttemptRouteContext = Readonly<{ params: Promise<{ attemptId: string }> }>;

export async function POST(request: Request, context: AttemptRouteContext) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) return withDeliveryAttemptNoStore(authentication.response);
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return withDeliveryAttemptNoStore(roleResponse);
  const originResponse = requireDeliveryAttemptMutationOrigin(request);
  if (originResponse) return originResponse;
  const parsed = await parseDeliveryAttemptJson(request, deliveryAttemptRetrySchema);
  if (!parsed.ok) return parsed.response;
  const parsedId = deliveryAttemptIdSchema.safeParse((await context.params).attemptId);
  if (!parsedId.success) {
    return deliveryAttemptJson(
      { error: "Delivery attempt was not found.", code: "DELIVERY_ATTEMPT_NOT_FOUND" },
      404
    );
  }
  try {
    return deliveryAttemptJson({
      attempt: await retryAttestedDeliveryAttempt({
        orgId: currentOrg.orgId,
        attemptId: parsedId.data,
        actorUserId: currentOrg.userId
      })
    });
  } catch (error) {
    return deliveryAttemptRouteError(error);
  }
}
