import { MembershipRole } from "@prisma/client";
import { requireApiRole } from "@/lib/auth/api-authorization";
import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import { getDeliveryAttempt } from "@/lib/messaging/delivery-attempt-review";
import { deliveryAttemptIdSchema } from "@/lib/validation/delivery-attempts";
import {
  deliveryAttemptJson,
  deliveryAttemptRouteError,
  withDeliveryAttemptNoStore
} from "../_shared";

type AttemptRouteContext = Readonly<{ params: Promise<{ attemptId: string }> }>;

export async function GET(request: Request, context: AttemptRouteContext) {
  const authentication = await authenticateApiRequest();
  if (!authentication.ok) return withDeliveryAttemptNoStore(authentication.response);
  const { currentOrg } = authentication;
  const roleResponse = requireApiRole(currentOrg, MembershipRole.ADMIN);
  if (roleResponse) return withDeliveryAttemptNoStore(roleResponse);

  const parsedId = deliveryAttemptIdSchema.safeParse((await context.params).attemptId);
  if (!parsedId.success) {
    return deliveryAttemptJson(
      { error: "Delivery attempt was not found.", code: "DELIVERY_ATTEMPT_NOT_FOUND" },
      404
    );
  }
  try {
    return deliveryAttemptJson({
      attempt: await getDeliveryAttempt(currentOrg.orgId, parsedId.data)
    });
  } catch (error) {
    return deliveryAttemptRouteError(error);
  }
}
