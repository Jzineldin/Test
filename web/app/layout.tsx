import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Submission Triage — Wholesale Insurance",
  description: "AI-drafted carrier submissions in seconds, not hours.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
