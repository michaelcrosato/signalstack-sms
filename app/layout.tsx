import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SignalStack SMS",
  description: "Demo-safe SMB texting SaaS scaffold",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
