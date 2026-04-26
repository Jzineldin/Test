import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://appetitematch.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AppetiteMatch - submission triage for wholesale insurance brokers",
    template: "%s · AppetiteMatch",
  },
  description:
    "Drop an ACORD, get carrier-ready submissions in seconds. AI submission triage for wholesale commercial insurance brokers and MGAs.",
  keywords: [
    "wholesale insurance broker",
    "submission triage",
    "ACORD",
    "carrier appetite",
    "MGA",
    "E&S insurance",
    "commercial insurance",
    "AI for brokers",
  ],
  authors: [{ name: "AppetiteMatch" }],
  openGraph: {
    title: "AppetiteMatch - submission triage for wholesale insurance brokers",
    description:
      "ACORD in, carrier-ready submissions out. Cuts CSR triage time from 30-90 minutes to seconds.",
    url: SITE_URL,
    siteName: "AppetiteMatch",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AppetiteMatch - submission triage for wholesale brokers",
    description:
      "ACORD in, carrier-ready submissions out. Cuts CSR triage time from 30-90 minutes to seconds.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
