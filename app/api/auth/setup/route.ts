import { handleLocalAuthSetup } from "@/lib/auth/auth-api";

export async function POST(request: Request) {
  return handleLocalAuthSetup(request);
}
