import { useEffect, useRef } from "react";

/**
 * "Digital rain" background for the Matrix theme.
 * Canvas, ~24 fps, pauses when the tab is hidden, static frame when the
 * user prefers reduced motion. Purely decorative (aria-hidden).
 */
const GLYPHS =
  "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン" +
  "0123456789$₿%+−×=<>";

export default function MatrixRain({
  opacity = 0.16,
  fontSize = 16,
  className = "",
  speed = 1,
}: {
  opacity?: number;
  fontSize?: number;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, cols = 0;
    let drops: number[] = [];
    let raf = 0;
    let last = 0;
    const frameMs = 1000 / 24;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = Math.floor(w * dpr);
      canvas!.height = Math.floor(h * dpr);
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      cols = Math.ceil(w / fontSize);
      drops = Array.from({ length: cols }, () => Math.floor(Math.random() * -h / fontSize));
      ctx!.fillStyle = "#000";
      ctx!.fillRect(0, 0, w, h);
    }

    function draw() {
      ctx!.fillStyle = "rgba(0, 0, 0, 0.09)";
      ctx!.fillRect(0, 0, w, h);
      ctx!.font = `${fontSize}px "JetBrains Mono", monospace`;
      for (let i = 0; i < cols; i++) {
        const ch = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        // bright head, green trail
        ctx!.fillStyle = Math.random() > 0.975 ? "#d8ffe0" : "#00ff41";
        ctx!.fillText(ch, x, y);
        if (y > h && Math.random() > 0.975) drops[i] = 0;
        drops[i] += speed;
      }
    }

    function loop(t: number) {
      raf = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (t - last < frameMs) return;
      last = t;
      draw();
    }

    resize();
    if (reduce) {
      for (let k = 0; k < 60; k++) draw();
    } else {
      raf = requestAnimationFrame(loop);
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [fontSize, speed]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className={`pointer-events-none ${className}`}
      style={{ opacity, width: "100%", height: "100%", display: "block" }}
    />
  );
}
