import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AppetiteMatch — submission triage for wholesale insurance brokers",
  description:
    "Drop an ACORD, get carrier-ready submissions in seconds. AI submission triage for wholesale commercial insurance brokers and MGAs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
