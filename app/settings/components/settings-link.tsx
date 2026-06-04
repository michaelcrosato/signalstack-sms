import Link from "next/link";
import type { ReactNode } from "react";

export function SettingsLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const baseClassName =
    "rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50";
  return (
    <Link
      className={className ? `${baseClassName} ${className}` : baseClassName}
      href={href}
    >
      {children}
    </Link>
  );
}
