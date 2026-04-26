import { NextResponse } from "next/server";
import { RELEASES } from "@/lib/releases";

const SITE_URL = "https://appetitematch.com";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Strip the same micro-markdown the changelog page renders, leaving plain text
// for feed readers that don't sanitize HTML in <description>.
function plain(s: string): string {
  return s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1");
}

export function GET() {
  const items = RELEASES.map((r) => {
    const link = `${SITE_URL}/changelog#${r.tag}`;
    const pubDate = new Date(`${r.when}T12:00:00Z`).toUTCString();
    const description = r.items.map((it) => `- ${plain(it)}`).join("\n");
    return `    <item>
      <title>${escapeXml(`AppetiteMatch ${r.tag}`)}</title>
      <link>${link}</link>
      <guid isPermaLink="false">${r.tag}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(description)}</description>
    </item>`;
  }).join("\n");

  const lastBuild = new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AppetiteMatch changelog</title>
    <link>${SITE_URL}/changelog</link>
    <atom:link href="${SITE_URL}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Submission triage agent for wholesale commercial insurance brokers.</description>
    <language>en-us</language>
    <lastBuildDate>${lastBuild}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=600",
    },
  });
}
