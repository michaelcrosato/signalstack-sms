import { handleLocalAuthLogin } from "@/lib/auth/auth-api";

export async function POST(request: Request) {
  return handleLocalAuthLogin(request);
}
