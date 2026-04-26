import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "AppetiteMatch — submission triage for wholesale insurance brokers";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          background:
            "linear-gradient(135deg, #020617 0%, #0f172a 50%, #052e2b 100%)",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "72px",
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            color: "#34d399",
            fontSize: "20px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              background: "#34d399",
            }}
          />
          AppetiteMatch
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "60px",
            fontSize: "72px",
            fontWeight: 600,
            lineHeight: 1.1,
            color: "#f1f5f9",
          }}
        >
          <span>Triage every submission</span>
          <span>in seconds.</span>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "36px",
            fontSize: "30px",
            lineHeight: 1.4,
            color: "#94a3b8",
            maxWidth: "880px",
          }}
        >
          ACORD in, carrier-ready submissions out. Built for wholesale
          commercial insurance brokers and MGAs.
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            gap: "16px",
            fontSize: "22px",
            color: "#cbd5e1",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "9999px",
              background: "rgba(52, 211, 153, 0.15)",
              color: "#34d399",
            }}
          >
            ✓ Atlas — 0.84
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "9999px",
              background: "rgba(56, 189, 248, 0.15)",
              color: "#7dd3fc",
            }}
          >
            ↩ Keystone — replied $42k
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 18px",
              borderRadius: "9999px",
              background: "rgba(52, 211, 153, 0.25)",
              color: "#34d399",
              fontWeight: 600,
            }}
          >
            ★ BOUND
          </div>
        </div>
      </div>
    ),
    size,
  );
}
