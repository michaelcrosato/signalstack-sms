import Link from "next/link";
import { getSettingsNavigationLinks } from "@/lib/operations/operator-surfaces";

export type SideNavProps = Readonly<{
  currentRoute?: string;
}>;

export function SideNav({ currentRoute }: SideNavProps) {
  const navigationLinks = getSettingsNavigationLinks();

  return (
    <aside className="w-64 shrink-0 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Settings & Operations
      </p>
      <nav aria-label="Settings navigation" className="flex flex-col gap-1">
        {navigationLinks.map((link) => {
          const isActive = currentRoute === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-teal-50 font-semibold text-teal-800 border border-teal-200"
                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
