import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { attestDeliveryAttemptNotSent } from "@/lib/messaging/delivery-attempt-review";
import {
  deliveryAttemptAttestationSchema,
  deliveryAttemptIdSchema
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
  const parsed = await parseDeliveryAttemptJson(request, deliveryAttemptAttestationSchema);
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
      attempt: await attestDeliveryAttemptNotSent({
        orgId: currentOrg.orgId,
        attemptId: parsedId.data,
        actorUserId: currentOrg.userId,
        reason: parsed.data.reason
      })
    });
  } catch (error) {
    return deliveryAttemptRouteError(error);
  }
}
