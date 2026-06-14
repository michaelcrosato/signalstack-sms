import Link from "next/link";
import type { ReactNode } from "react";
import type { LinkProps } from "next/link";

export interface SettingsLinkProps extends LinkProps {
  children: ReactNode;
  className?: string;
}

export function SettingsLink({
  children,
  className = "",
  ...props
}: SettingsLinkProps) {
  const baseClassName =
    "rounded border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-teal-700 transition hover:border-teal-300 hover:bg-teal-50";
  const combinedClassName = className
    ? `${baseClassName} ${className}`
    : baseClassName;

  return (
    <Link {...props} className={combinedClassName}>
      {children}
    </Link>
  );
}
