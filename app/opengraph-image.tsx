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
          background: "#f6f3ec",
          backgroundImage: "radial-gradient(#cdc5ae 2px, transparent 2px)",
          backgroundSize: "48px 48px",
          color: "#1b1a17",
          fontFamily: "Georgia, serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 110, fontWeight: 700 }}>
          I’m Hilman
          <span style={{ color: "#2553c4" }}>.</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 40,
            color: "#57534a",
          }}
        >
          design · stories · code — a living creative archive
        </div>
        <div
          style={{
            display: "flex",
            position: "absolute",
            right: 80,
            top: 70,
            background: "#f5c518",
            color: "#3a2f00",
            padding: "14px 26px",
            fontSize: 28,
            transform: "rotate(3deg)",
            boxShadow: "2px 4px 0 rgba(27,26,23,0.2)",
          }}
        >
          welcome to my desk
        </div>
      </div>
    ),
    size
  );
}
