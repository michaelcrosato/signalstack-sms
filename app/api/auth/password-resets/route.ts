import { authenticateApiRequest } from "@/lib/auth/api-authentication";
import {
  passwordResetNoStoreJson,
  withPasswordResetNoStore
} from "@/app/api/auth/password-resets/route-support";

/**
 * Organization roles cannot issue a bearer that replaces a user-global credential. Lost-password
 * recovery is intentionally restricted to the platform-operator `admin:reset-link` boundary.
 */
export async function POST(request: Request) {
  const authentication = await authenticateApiRequest(request);
  if (!authentication.ok) {
    return withPasswordResetNoStore(authentication.response);
  }

  return passwordResetNoStoreJson(
    {
      error: "Password reset links require a platform operator.",
      code: "PASSWORD_RESET_OPERATOR_REQUIRED"
    },
    403
  );
}
