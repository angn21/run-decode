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

    const allPoints: [number, number][] = [];
    for (const poly of polylines.slice(0, 8)) {
      allPoints.push(...decodePolyline(poly));
    }

    if (allPoints.length < 2) return;

    const lats = allPoints.map((p) => p[0]);
    const lngs = allPoints.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const pad = 20;
    const scaleX = (w - pad * 2) / (maxLng - minLng || 1);
    const scaleY = (h - pad * 2) / (maxLat - minLat || 1);
    const scale = Math.min(scaleX, scaleY);

    const toX = (lng: number) => pad + (lng - minLng) * scale;
    const toY = (lat: number) => h - pad - (lat - minLat) * scale;

    ctx.globalAlpha = 0.15;
    for (const poly of polylines.slice(0, 8)) {
      const pts = decodePolyline(poly);
      if (pts.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(toX(pts[0][1]), toY(pts[0][0]));
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(toX(pts[i][1]), toY(pts[i][0]));
      }
      ctx.strokeStyle = "#2dd4bf";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [polylines]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={300}
      className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
    />
  );
}
