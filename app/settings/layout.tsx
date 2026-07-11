import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";

// Every settings route crosses the session boundary in this layout and must be resolved per request.
export const dynamic = "force-dynamic";

export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentOrg = await requireProtectedPage("/settings");
  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      {children}
    </>
  );
}
