import Link from "next/link";

export function FilterLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      className={
        active
          ? "rounded border border-slate-950 bg-slate-950 px-3 py-1 text-xs font-semibold text-white"
          : "rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700"
      }
      href={href}
    >
      {label}
    </Link>
  );
}
