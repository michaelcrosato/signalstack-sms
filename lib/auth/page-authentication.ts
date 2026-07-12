import { redirect } from "next/navigation";
import {
  CurrentOrgAuthError,
  getOrCreateCurrentOrg,
  type CurrentOrg
} from "@/lib/auth/current-org";
import { withAuthDatabaseContext } from "@/lib/db/tenant-context";

/** Resolve a protected Server Component boundary and turn only expected missing-auth state into navigation. */
export async function requireProtectedPage(redirectTo: string): Promise<CurrentOrg> {
  try {
    return await getOrCreateCurrentOrg();
  } catch (error) {
    if (!(error instanceof CurrentOrgAuthError) || error.code !== "AUTH_REQUIRED") {
      throw error;
    }
  }

  const setupRequired = await withAuthDatabaseContext(
    { purpose: "bootstrap" },
    async (client) => (await client.localCredential.count()) === 0
  );
  redirect(setupRequired ? "/setup" : `/login?redirectTo=${encodeURIComponent(safeRedirect(redirectTo))}`);
}

function safeRedirect(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")
    ? value
    : "/dashboard";
}
