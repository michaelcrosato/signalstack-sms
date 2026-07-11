import { handleLocalAuthSession } from "@/lib/auth/auth-api";

export async function GET(request: Request) {
  return handleLocalAuthSession(request);
}
