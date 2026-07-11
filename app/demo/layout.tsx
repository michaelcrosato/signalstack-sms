import { requireProtectedPage } from "@/lib/auth/page-authentication";
import { AuthenticatedHeader } from "@/components/auth/authenticated-header";

export default async function DemoLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentOrg = await requireProtectedPage("/demo");
  return (
    <>
      <AuthenticatedHeader currentOrg={currentOrg} />
      {children}
    </>
  );
}
