import Link from "next/link";
import type { CurrentOrg } from "@/lib/auth/current-org";

const navigation = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/organizations", label: "Organizations" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
  { href: "/account", label: "Account" }
] as const;

export function AuthenticatedHeader({ currentOrg }: Readonly<{ currentOrg: CurrentOrg }>) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <Link className="font-semibold text-slate-950" href="/dashboard">
            SignalStack SMS
          </Link>
          <p className="truncate text-xs text-slate-500">
            {currentOrg.orgName} · {currentOrg.email} · {currentOrg.role}
          </p>
        </div>
        <nav aria-label="Account and organization" className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {navigation.map((item) => (
            <Link className="font-medium text-slate-700 hover:text-teal-800" href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
          <Link className="font-semibold text-teal-700 hover:text-teal-900" href="/logout">
            Sign out
          </Link>
        </nav>
      </div>
    </header>
  );
}
