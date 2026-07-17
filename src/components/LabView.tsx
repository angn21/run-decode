"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import {
  LAB_PRESETS,
  type LabPeriod,
  type LabPreset,
  type LabStats,
} from "@/lib/lab";
import { formatPercent } from "@/lib/format";
import { countStreamsCoverage } from "@/lib/km-split";

export function LabView({
  stats,
  period,
  athleteName,
  allActivities,
}: {
  stats: LabStats;
  period: LabPeriod;
  athleteName?: string | null;
  allActivities: { streams_json: string | null }[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const cardRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [customFrom, setCustomFrom] = useState(
    period.kind === "custom" ? period.from : "",
  );
  const [customTo, setCustomTo] = useState(
    period.kind === "custom" ? period.to : "",
  );

  const coverage = countStreamsCoverage(allActivities);
  const needsBackfill = coverage.withStreams < coverage.total;
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillProgress, setBackfillProgress] = useState<string | null>(null);

  function navigatePreset(preset: LabPreset) {
    startTransition(() => {
      router.push(`/lab?preset=${preset}`);
    });
  }

  function applyCustomRange() {
    if (!customFrom || !customTo) return;
    const from = customFrom <= customTo ? customFrom : customTo;
    const to = customFrom <= customTo ? customTo : customFrom;
    startTransition(() => {
      router.push(`/lab?from=${from}&to=${to}`);
    });
  }

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
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      cacheBust: true,
    });
    const res = await fetch(dataUrl);
    return res.blob();
  }

  async function downloadCard() {
    if (!cardRef.current) return;
    const dataUrl = await toPng(cardRef.current, {
      pixelRatio: 2,
      cacheBust: true,
    });
    const link = document.createElement("a");
    link.download = `run-decode-lab-${stats.periodLabel.replace(/\s+/g, "-").toLowerCase()}.png`;
    link.href = dataUrl;
    link.click();
    setStatus("Saved to downloads");
    setTimeout(() => setStatus(null), 2500);
  }

  async function shareCard() {
    try {
      const blob = await renderCard();
      if (!blob) return;
      const file = new File([blob], `run-decode-lab.png`, {
        type: "image/png",
      });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          title: `Run Decode Lab — ${stats.periodLabel}`,
          text: `${stats.runCount} runs · ${stats.totalKm.toFixed(1)} km`,
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

  const runBackfill = useCallback(async () => {
    setBackfillBusy(true);
    setBackfillProgress("Starting…");
    try {
      let remaining = Infinity;
      let totalFetched = 0;
      while (remaining > 0) {
        const res = await fetch("/api/lab/backfill-streams", {
          method: "POST",
        });
        const data = (await res.json()) as {
          done?: boolean;
          remaining?: number;
          fetched?: number;
          withStreams?: number;
          total?: number;
          error?: string;
        };
        if (!res.ok) {
          setBackfillProgress(data.error ?? "Backfill failed");
          break;
        }
        totalFetched += data.fetched ?? 0;
        remaining = data.remaining ?? 0;
        setBackfillProgress(
          `${data.withStreams ?? 0} of ${data.total ?? "?"} cached` +
            (remaining > 0 ? ` · fetching…` : ""),
        );
        if (data.done || remaining === 0) {
          setBackfillProgress(
            `Done — ${data.withStreams ?? totalFetched} runs have stream data`,
          );
          startTransition(() => router.refresh());
          break;
        }
      }
    } catch {
      setBackfillProgress("Backfill failed — try again");
    } finally {
      setBackfillBusy(false);
    }
  }, [router]);

  const canNativeShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const activePreset = period.kind === "preset" ? period.preset : null;

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-xs uppercase tracking-wider text-zinc-500">
          Period
        </p>
        <div className="flex flex-wrap gap-2">
          {LAB_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigatePreset(p.id)}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                activePreset === p.id
                  ? "bg-white/10 text-white"
                  : "text-zinc-500 hover:text-white"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm text-zinc-400">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white"
            />
          </label>
          <label className="text-sm text-zinc-400">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="mt-1 block rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white"
            />
          </label>
          <button
            type="button"
            onClick={applyCustomRange}
            disabled={!customFrom || !customTo}
            className="rounded-lg border border-white/15 px-4 py-1.5 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white disabled:opacity-40"
          >
            Apply range
          </button>
        </div>
      </div>

      {needsBackfill && (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-sm text-zinc-300">
            Split data: {coverage.withStreams} of {coverage.total} runs cached.
            Load streams once to unlock fastest km split (rate-limited).
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={runBackfill}
              disabled={backfillBusy}
              className="rounded-lg bg-[#fc4c02]/20 px-4 py-2 text-sm text-[#fc4c02] hover:bg-[#fc4c02]/30 disabled:opacity-50"
            >
              {backfillBusy ? "Loading…" : "Load split data"}
            </button>
            {backfillProgress && (
              <span className="text-xs text-zinc-500">{backfillProgress}</span>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard label="Distance" value={`${stats.totalKm.toFixed(1)} km`} />
        <StatCard label="Runs" value={String(stats.runCount)} />
        <StatCard label="Time" value={stats.totalTimeLabel} />
        <StatCard label="Avg pace" value={stats.avgPace} />
        <StatCard
          label="Avg HR"
          value={stats.avgHr != null ? `${stats.avgHr} bpm` : "—"}
        />
        <StatCard
          label="Max HR"
          value={stats.maxHr != null ? `${stats.maxHr} bpm` : "—"}
        />
        <StatCard
          label="Avg cadence"
          value={stats.avgCadence != null ? `${stats.avgCadence} spm` : "—"}
        />
        <StatCard
          label="Easy / hard"
          value={stats.easyHardLabel}
          sub={stats.easyHardDetail}
        />
        <StatCard
          label="vs prior period"
          value={formatPercent(stats.vsPrior)}
        />
        <StatCard
          label="Fastest km"
          value={stats.fastestKm?.pace ?? "—"}
          sub={stats.fastestKm?.runName ?? undefined}
        />
      </div>

      <div>
        <p className="mb-3 text-xs uppercase tracking-wider text-zinc-500">
          Share card
        </p>
        <div
          ref={cardRef}
          className="rounded-2xl border border-white/10 bg-[#0f1419] p-8"
        >
          <p className="text-xs uppercase tracking-widest text-[#fc4c02]">
            Run Decode Lab · {stats.periodLabel}
          </p>
          {athleteName && (
            <p className="mt-1 text-sm text-zinc-500">{athleteName}</p>
          )}
          <h2 className="mt-2 text-3xl font-bold text-white">
            {stats.runCount} runs · {stats.totalKm.toFixed(1)} km
          </h2>
          <p className="mt-1 text-zinc-400">
            {stats.totalTimeLabel}
            {stats.vsPrior != null ? ` · ${stats.vsPriorLabel} vs prior` : ""}
          </p>

          <div className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-3">
            <MiniStat label="Avg pace" value={stats.avgPace} />
            <MiniStat
              label="Avg HR"
              value={stats.avgHr != null ? `${stats.avgHr} bpm` : "—"}
            />
            <MiniStat
              label="Max HR"
              value={stats.maxHr != null ? `${stats.maxHr} bpm` : "—"}
            />
            <MiniStat
              label="Cadence"
              value={
                stats.avgCadence != null ? `${stats.avgCadence} spm` : "—"
              }
            />
            <MiniStat
              label="Easy / hard"
              value={stats.easyHardLabel}
            />
            <MiniStat
              label="Fastest km"
              value={stats.fastestKm?.pace ?? "—"}
            />
          </div>

          <div className="mt-8">
            <img
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-md"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          {canNativeShare && (
            <button
              type="button"
              onClick={shareCard}
              className="rounded-lg bg-[#fc4c02] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#e04400]"
            >
              Share card
            </button>
          )}
          <button
            type="button"
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
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase text-zinc-500">{label}</p>
      <p className="text-lg font-semibold text-white">{value}</p>
    </div>
  );
}
