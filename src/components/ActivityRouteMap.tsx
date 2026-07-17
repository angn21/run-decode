"use client";

import { useEffect, useRef } from "react";
import { decodePolyline } from "@/lib/polyline";

export function ActivityRouteMap({
  polyline,
}: {
  polyline: string | null | undefined;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !polyline) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const pts = decodePolyline(polyline);
    if (pts.length < 2) return;

    const pad = 20;
    const lats = pts.map((p) => p[0]);
    const lngs = pts.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const spanLng = maxLng - minLng || 0.001;
    const spanLat = maxLat - minLat || 0.001;
    const scale = Math.min((w - pad * 2) / spanLng, (h - pad * 2) / spanLat);

    const toX = (lng: number) =>
      (w - spanLng * scale) / 2 + (lng - minLng) * scale;
    const toY = (lat: number) =>
      (h - spanLat * scale) / 2 + (maxLat - lat) * scale;

    ctx.beginPath();
    ctx.moveTo(toX(pts[0][1]), toY(pts[0][0]));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(toX(pts[i][1]), toY(pts[i][0]));
    }
    ctx.strokeStyle = "#fc4c02";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    // Start / end dots
    ctx.fillStyle = "#2dd4bf";
    ctx.beginPath();
    ctx.arc(toX(pts[0][1]), toY(pts[0][0]), 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fc4c02";
    ctx.beginPath();
    const last = pts[pts.length - 1];
    ctx.arc(toX(last[1]), toY(last[0]), 4, 0, Math.PI * 2);
    ctx.fill();
  }, [polyline]);

  if (!polyline) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-zinc-500">
        No map for this run.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <canvas
        ref={canvasRef}
        width={640}
        height={220}
        className="h-40 w-full sm:h-48"
        aria-label="Run route"
      />
    </div>
  );
}
