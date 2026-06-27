"use client";

import { useRef } from "react";
import { toPng } from "html-to-image";
import type { WrappedStats } from "@/lib/wrapped";
import { secondsToDuration, formatPercent } from "@/lib/format";
import { PolylineArt } from "./PolylineArt";

export function WrappedView({
  stats,
  period,
}: {
  stats: WrappedStats;
  period: "week" | "month";
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  async function downloadCard() {
    if (!cardRef.current) return;
    const dataUrl = await toPng(cardRef.current, { pixelRatio: 2 });
    const link = document.createElement("a");
    link.download = `run-decode-${period}.png`;
    link.href = dataUrl;
    link.click();
  }

  return (
    <div className="space-y-6">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1419] p-8"
      >
        <PolylineArt polylines={stats.polylines} />

        <div className="relative z-10">
          <p className="text-xs uppercase tracking-widest text-[#fc4c02]">
            Run Decode · {stats.periodLabel}
          </p>
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
        </div>
      </div>

      <button
        onClick={downloadCard}
        className="rounded-lg bg-[#fc4c02] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#e04400]"
      >
        Download share card
      </button>
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
