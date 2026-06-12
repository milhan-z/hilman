import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Hilman. — a living creative archive";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "#0a0a0a",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          color: "#f2efe9",
          fontFamily: "Georgia, serif",
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: "#f5c518",
            fontFamily: "monospace",
          }}
        >
          Field Notebook · No. 2026
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", marginTop: 18, fontSize: 150, fontWeight: 700 }}>
          Hilman
          <div
            style={{
              width: 26,
              height: 26,
              marginTop: 36,
              marginLeft: 14,
              background: "#ff6b5b",
              borderRadius: 4,
            }}
          />
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 40, color: "#a3a097" }}>
          design · stories · code — a living creative archive
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 80,
            top: 80,
            background: "#f5c518",
            color: "#0a0a0a",
            padding: "12px 24px",
            fontSize: 26,
            fontFamily: "monospace",
            textTransform: "uppercase",
            letterSpacing: 2,
            transform: "rotate(3deg)",
            boxShadow: "0 0 40px rgba(245,197,24,0.35)",
          }}
        >
          start anywhere
        </div>
      </div>
    ),
    size
  );
}
