import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Submission Triage — for wholesale commercial insurance brokers",
  description:
    "Drop an ACORD, get carrier-ready submissions in seconds. AI submission triage for wholesale brokers and MGAs.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
