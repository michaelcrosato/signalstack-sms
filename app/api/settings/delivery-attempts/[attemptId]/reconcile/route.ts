import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { reconcileDeliveryAttempt } from "@/lib/messaging/delivery-attempt-review";
import { deliveryAttemptIdSchema } from "@/lib/validation/delivery-attempts";
import {
  deliveryAttemptJson,
  deliveryAttemptRouteError,
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
  if (request.body !== null) {
    return deliveryAttemptJson(
      { error: "Delivery attempt request is invalid.", code: "DELIVERY_ATTEMPT_INVALID" },
      400
    );
  }
  const parsedId = deliveryAttemptIdSchema.safeParse((await context.params).attemptId);
  if (!parsedId.success) {
    return deliveryAttemptJson(
      { error: "Delivery attempt was not found.", code: "DELIVERY_ATTEMPT_NOT_FOUND" },
      404
    );
  }
  try {
    return deliveryAttemptJson({
      attempt: await reconcileDeliveryAttempt({
        orgId: currentOrg.orgId,
        attemptId: parsedId.data,
        actorUserId: currentOrg.userId
      })
    });
  } catch (error) {
    return deliveryAttemptRouteError(error);
  }
}
