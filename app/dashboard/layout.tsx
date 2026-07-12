import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";

export default async function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentOrg = await requireProtectedPage("/dashboard");
  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      {children}
    </>
  );
}
