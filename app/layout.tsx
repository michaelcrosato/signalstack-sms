import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalStack SMS",
  description: "Self-hosted SMS operations and integration platform"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
