"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ink Field — particles drifting through a flow field, drawn like ink on paper.
 * Move your cursor (or finger) to stir the field. Theme-aware, reduced-motion aware.
 */
export function InkField({ density = 90 }: { density?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointer = { x: -9999, y: -9999 };

    type P = { x: number; y: number; px: number; py: number };
    let particles: P[] = [];

    function themeColors() {
      const styles = getComputedStyle(document.documentElement);
      return {
        ink: styles.getPropertyValue("--pen").trim() || "#2553c4",
        accent: styles.getPropertyValue("--hl").trim() || "#f5c518",
      };
    }

    function resize() {
      const rect = canvas!.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas!.width = width * dpr;
      canvas!.height = height * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      particles = Array.from({ length: density }, () => {
        const x = Math.random() * width;
        const y = Math.random() * height;
        return { x, y, px: x, py: y };
      });
      ctx!.clearRect(0, 0, width, height);
    }

    // cheap pseudo-noise flow angle
    function angle(x: number, y: number, t: number) {
      return (
        Math.sin(x * 0.004 + t * 0.0003) * 2.1 +
        Math.cos(y * 0.005 - t * 0.0002) * 1.7
      );
    }

    let last = 0;
    function frame(t: number) {
      raf = requestAnimationFrame(frame);
      if (t - last < 16) return;
      last = t;
      const { ink, accent } = themeColors();

      // gentle fade for trails
      ctx!.globalCompositeOperation = "destination-out";
      ctx!.fillStyle = "rgba(0,0,0,0.04)";
      ctx!.fillRect(0, 0, width, height);
      ctx!.globalCompositeOperation = "source-over";

      particles.forEach((p, i) => {
        const a = angle(p.x, p.y, t);
        let vx = Math.cos(a) * 1.2;
        let vy = Math.sin(a) * 1.2;
        // cursor stirs the field
        const dx = p.x - pointer.x;
        const dy = p.y - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < 16000) {
          const f = (1 - d2 / 16000) * 4;
          vx += (dx / Math.sqrt(d2 + 1)) * f;
          vy += (dy / Math.sqrt(d2 + 1)) * f;
        }
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy;
        if (p.x < -10 || p.x > width + 10 || p.y < -10 || p.y > height + 10) {
          p.x = Math.random() * width;
          p.y = Math.random() * height;
          p.px = p.x;
          p.py = p.y;
        }
        ctx!.strokeStyle = i % 11 === 0 ? accent : ink;
        ctx!.globalAlpha = 0.45;
        ctx!.lineWidth = 1.1;
        ctx!.beginPath();
        ctx!.moveTo(p.px, p.py);
        ctx!.lineTo(p.x, p.y);
        ctx!.stroke();
        ctx!.globalAlpha = 1;
      });
    }

    function drawStatic() {
      const { ink } = themeColors();
      ctx!.strokeStyle = ink;
      ctx!.globalAlpha = 0.4;
      particles.forEach((p) => {
        let x = p.x;
        let y = p.y;
        ctx!.beginPath();
        ctx!.moveTo(x, y);
        for (let s = 0; s < 40; s++) {
          const a = angle(x, y, 0);
          x += Math.cos(a) * 3;
          y += Math.sin(a) * 3;
          ctx!.lineTo(x, y);
        }
        ctx!.stroke();
      });
      ctx!.globalAlpha = 1;
    }

    resize();
    const onResize = () => resize();
    const onMove = (e: PointerEvent) => {
      const rect = canvas!.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    const onLeave = () => {
      pointer.x = -9999;
      pointer.y = -9999;
    };
    window.addEventListener("resize", onResize);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);

    if (reduced || paused) {
      drawStatic();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
    };
  }, [density, paused]);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <canvas
        ref={canvasRef}
        className="h-[320px] w-full touch-none sm:h-[400px]"
        aria-label="Ink Field — generative flow field. Move your cursor to stir the ink."
        role="img"
      />
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
        <p className="font-hand text-lg text-faint">move your cursor — the ink follows</p>
        <button
          type="button"
          onClick={() => setPaused((v) => !v)}
          className="rounded px-3 py-1.5 text-xs font-medium text-soft transition-colors hover:bg-n-100 hover:text-ink"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
