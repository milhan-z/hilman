"use client";

import { useEffect, useRef, useState } from "react";

type Pen = "pen" | "highlighter" | "redpen";

const PENS: Record<Pen, { label: string; varName: string; width: number; alpha: number }> = {
  pen: { label: "Ink pen", varName: "--pen", width: 2.5, alpha: 1 },
  highlighter: { label: "Highlighter", varName: "--hl", width: 16, alpha: 0.5 },
  redpen: { label: "Red pen", varName: "--red", width: 2.5, alpha: 1 },
};

/**
 * Doodle Pad — a ruled notebook page you can actually draw on,
 * with the site's three stationery tools. Works with mouse, touch, and stylus.
 */
export function DoodlePad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pen, setPen] = useState<Pen>("pen");
  const penRef = useRef<Pen>("pen");
  penRef.current = pen;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let drawing = false;
    let lx = 0;
    let ly = 0;

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      // keep existing drawing on resize
      const prev = ctx!.getImageData(0, 0, canvas!.width, canvas!.height);
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx!.putImageData(prev, 0, 0);
      ctx!.lineCap = "round";
      ctx!.lineJoin = "round";
    }
    resize();

    function pos(e: PointerEvent) {
      const rect = canvas!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function down(e: PointerEvent) {
      drawing = true;
      canvas!.setPointerCapture(e.pointerId);
      const p = pos(e);
      lx = p.x;
      ly = p.y;
    }
    function move(e: PointerEvent) {
      if (!drawing) return;
      const p = pos(e);
      const tool = PENS[penRef.current];
      const color = getComputedStyle(document.documentElement)
        .getPropertyValue(tool.varName)
        .trim();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = tool.width;
      ctx!.globalAlpha = tool.alpha;
      ctx!.beginPath();
      ctx!.moveTo(lx, ly);
      ctx!.lineTo(p.x, p.y);
      ctx!.stroke();
      ctx!.globalAlpha = 1;
      lx = p.x;
      ly = p.y;
    }
    function up() {
      drawing = false;
    }

    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    window.addEventListener("resize", resize);
    return () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("resize", resize);
    };
  }, []);

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-raise shadow-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        {(Object.keys(PENS) as Pen[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setPen(key)}
            aria-pressed={pen === key}
            className={`min-h-[36px] rounded-full border px-3.5 py-1 text-xs font-medium transition-colors duration-fast ${
              pen === key
                ? "border-transparent bg-hl text-hl-ink"
                : "border-line text-soft hover:border-pen hover:text-pen"
            }`}
          >
            {PENS[key].label}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          className="ml-auto min-h-[36px] rounded-full px-3.5 py-1 text-xs font-medium text-red transition-colors hover:bg-red-soft"
        >
          Tear page out
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="ruled h-[340px] w-full cursor-crosshair touch-none sm:h-[420px]"
        aria-label="Doodle pad — draw with the ink pen, highlighter, or red pen."
        role="img"
      />
    </div>
  );
}
