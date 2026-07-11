import { handleLocalAuthLogout } from "@/lib/auth/auth-api";

export async function POST(request: Request) {
  return handleLocalAuthLogout(request);
}
