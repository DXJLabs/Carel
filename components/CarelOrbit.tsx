"use client";

import { useEffect, useRef } from "react";

/** CAREL's own orbit artwork. It never reads pointer or wallet state. */
export function CarelOrbit({ className, paused = false, centered = false }: {
  className?: string;
  paused?: boolean;
  centered?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = true;
    let frame = 0;
    let previous = 0;
    let phase = 0;
    let width = 430;
    let height = 250;

    function draw() {
      if (!canvas || !context) return;
      const w = width, h = height;
      const cx = w * (centered ? 0.5 : 0.74), cy = h * 0.5;
      const radius = Math.min(w * 0.25, h * 0.38);
      const t = phase * 0.00018;
      context.clearRect(0, 0, w, h);
      const glow = context.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.4);
      glow.addColorStop(0, "rgba(197,52,0,.15)");
      glow.addColorStop(0.55, "rgba(197,52,0,.035)");
      glow.addColorStop(1, "rgba(197,52,0,0)");
      context.fillStyle = glow;
      context.fillRect(0, 0, w, h);

      function project(angle: number, ring: number) {
        const r = radius * (1 - ring * 0.12);
        const tilt = 0.55 + ring * 0.73 + Math.sin(t * 0.48) * 0.15;
        const rotation = t * 0.22 + ring * 0.87;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r * Math.cos(tilt);
        const z = Math.sin(angle) * r * Math.sin(tilt);
        const rx = x * Math.cos(rotation) + z * Math.sin(rotation);
        const rz = -x * Math.sin(rotation) + z * Math.cos(rotation);
        const spin = -0.38 + Math.sin(t * 0.31) * 0.14;
        const scale = (radius * 4) / (radius * 4 - rz);
        return { x: cx + (rx * Math.cos(spin) - y * Math.sin(spin)) * scale,
          y: cy + (rx * Math.sin(spin) + y * Math.cos(spin)) * scale, z: rz, scale };
      }
      const segments = [];
      for (let ring = 0; ring < 3; ring++) {
        const head = t * (ring === 1 ? -0.76 : 1) + ring * 2.1;
        const length = Math.PI * 1.76;
        for (let index = 0; index < 120; index++) {
          const u = index / 120;
          const a = project(head - length + u * length, ring);
          const b = project(head - length + ((index + 1) / 120) * length, ring);
          segments.push({ a, b, ring, u, z: (a.z + b.z) / 2 });
        }
      }
      segments.sort((a, b) => a.z - b.z);
      context.lineCap = "round";
      for (const { a, b, ring, u, z } of segments) {
        const depth = Math.max(0.2, Math.min(1, (z / radius + 1) * 0.5));
        const strength = (0.15 + 0.5 * depth) * (0.38 + 0.62 * u);
        context.strokeStyle = `rgba(${ring === 1 ? "250,250,250" : "197,52,0"},${strength * (ring === 1 ? 0.37 : 1)})`;
        context.lineWidth = (ring === 1 ? 0.7 : 1.5) * a.scale;
        context.beginPath(); context.moveTo(a.x, a.y); context.lineTo(b.x, b.y); context.stroke();
      }
      for (let ring = 0; ring < 3; ring++) {
        const p = project(t * (ring === 1 ? -0.76 : 1) + ring * 2.1, ring);
        const halo = context.createRadialGradient(p.x, p.y, 0, p.x, p.y, 9);
        halo.addColorStop(0, "rgba(197,52,0,.55)");
        halo.addColorStop(1, "rgba(197,52,0,0)");
        context.fillStyle = halo;
        context.beginPath(); context.arc(p.x, p.y, 9, 0, Math.PI * 2); context.fill();
        context.fillStyle = ring === 1 ? "rgba(250,250,250,.65)" : "#c53400";
        context.beginPath(); context.arc(p.x, p.y, 1.8 * p.scale, 0, Math.PI * 2); context.fill();
      }
    }
    function canAnimate() { return visible && !document.hidden && !motion.matches && !paused; }
    function tick(time: number) {
      frame = 0;
      if (!canAnimate()) return;
      if (time - previous >= 50) {
        phase += Math.min(time - previous, 80);
        previous = time;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      frame = 0;
      draw();
      previous = performance.now();
      if (canAnimate()) frame = requestAnimationFrame(tick);
    }
    function resize() {
      if (!canvas || !context) return;
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width); height = Math.max(1, rect.height);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      sync();
    }
    const resizeObserver = new ResizeObserver(resize);
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    resizeObserver.observe(canvas); visibilityObserver.observe(canvas);
    document.addEventListener("visibilitychange", sync);
    motion.addEventListener("change", sync);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect(); visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      motion.removeEventListener("change", sync);
    };
  }, [paused, centered]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
