import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";

export default async function SettingsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentOrg = await requireProtectedPage("/settings");
  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      {children}
    </>
  );
}
