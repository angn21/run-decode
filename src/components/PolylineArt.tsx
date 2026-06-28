"use client";

import { useEffect, useRef } from "react";
import { decodePolyline } from "@/lib/polyline";

export function PolylineArt({ polylines }: { polylines: string[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pad = 16;

    for (const poly of polylines.slice(0, 8)) {
      const pts = decodePolyline(poly);
      if (pts.length < 2) continue;

      const lats = pts.map((p) => p[0]);
      const lngs = pts.map((p) => p[1]);
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);

      const spanLng = maxLng - minLng || 0.001;
      const spanLat = maxLat - minLat || 0.001;
      const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);

      const toX = (lng: number) => (w - spanLng * scale) / 2 + (lng - minLng) * scale;
      const toY = (lat: number) => (h - spanLat * scale) / 2 + (maxLat - lat) * scale;

      ctx.beginPath();
      ctx.moveTo(toX(pts[0][1]), toY(pts[0][0]));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(toX(pts[i][1]), toY(pts[i][0]));
      }
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.18;
      ctx.stroke();
    }
  }, [polylines]);

  return (
    <canvas
      ref={canvasRef}
      width={480}
      height={220}
      className="h-full w-full"
      aria-hidden
    />
  );
}
