"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { WrappedStats } from "@/lib/wrapped";
import { secondsToDuration, formatPercent } from "@/lib/format";
import { PolylineArt } from "./PolylineArt";

export function WrappedView({
  stats,
  period,
  athleteName,
}: {
  stats: WrappedStats;
  period: "week" | "month";
  athleteName?: string | null;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function renderCard(): Promise<Blob | null> {
    if (!cardRef.current) return null;
    await Promise.all(
      Array.from(cardRef.current.querySelectorAll("img")).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function downloadCard() {
    if (!cardRef.current) return;
    await Promise.all(
      Array.from(cardRef.current.querySelectorAll("img")).map(
        (img) =>
          new Promise<void>((resolve) => {
            if (img.complete) resolve();
            else {
              img.onload = () => resolve();
              img.onerror = () => resolve();
            }
          }),
      ),
    );
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
    const link = document.createElement("a");
    link.download = `run-decode-${period}-${stats.periodLabel.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = dataUrl;
    link.click();
    setStatus("Saved to downloads");
    setTimeout(() => setStatus(null), 2500);
  }

  async function shareCard() {
    try {
      const blob = await renderCard();
      if (!blob) return;

      const file = new File(
        [blob],
        `run-decode-${period}.png`,
        { type: "image/png" },
      );

      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Run Decode — ${stats.periodLabel}`,
          text: stats.headline,
          files: [file],
        });
        return;
      }

      await downloadCard();
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      await downloadCard();
    }
  }

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function";

  return (
    <div className="space-y-6">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1419] p-8"
      >
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-[58%] overflow-hidden"
          aria-hidden
        >
          <div className="absolute inset-0 bg-gradient-to-l from-transparent via-[#0f1419]/40 to-[#0f1419]" />
          <PolylineArt polylines={stats.polylines} />
        </div>

        <div className="relative z-10">
          <p className="text-xs uppercase tracking-widest text-[#fc4c02]">
            Run Decode · {stats.periodLabel}
          </p>
          {athleteName && (
            <p className="mt-1 text-sm text-zinc-500">{athleteName}</p>
          )}
          <h2 className="mt-2 text-4xl font-bold text-white">{stats.headline}</h2>
          <p className="mt-2 text-zinc-400">{stats.coachNote}</p>

          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
            <MiniStat label="Distance" value={`${stats.totalKm.toFixed(1)} km`} />
            <MiniStat label="Runs" value={String(stats.runCount)} />
            <MiniStat label="Time" value={secondsToDuration(stats.totalTime)} />
            <MiniStat
              label="vs last"
              value={formatPercent(stats.vsLastPeriod)}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-4 text-sm text-zinc-400">
            <span>Fastest: {stats.fastestPace}</span>
            <span>Best day: {stats.bestDay}</span>
            <span>{stats.easyPercent}% easy runs</span>
          </div>

          <div className="mt-8 flex items-center gap-2.5">
            <img
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-md"
            />
            <span className="text-xs text-zinc-500">run-decode.vercel.app</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canNativeShare && (
          <button
            onClick={shareCard}
            className="rounded-lg bg-[#fc4c02] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#e04400]"
          >
            Share card
          </button>
        )}
        <button
          onClick={downloadCard}
          className={`rounded-lg px-5 py-2.5 text-sm font-medium ${
            canNativeShare
              ? "border border-white/15 text-zinc-300 hover:border-white/30 hover:text-white"
              : "bg-[#fc4c02] text-white hover:bg-[#e04400]"
          }`}
        >
          Download PNG
        </button>
        {status && <span className="text-sm text-zinc-500">{status}</span>}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className="text-xl font-semibold text-white">{value}</p>
    </div>
  );
}
