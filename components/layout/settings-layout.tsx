import type { ReactNode } from "react";

export function SettingsLayout({
  children,
  maxWidth = "max-w-6xl",
}: {
  children: ReactNode;
  maxWidth?: "max-w-5xl" | "max-w-6xl";
}) {
  return (
    <main
      className={`mx-auto flex min-h-screen w-full ${maxWidth} flex-col gap-8 px-6 py-10`}
    >
      {children}
    </main>
  );
}
