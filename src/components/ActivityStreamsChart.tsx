"use client";

import { useMemo } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { secondsToPace } from "@/lib/format";
import type { StravaStreams } from "@/lib/strava";

type ChartPoint = {
  km: number;
  paceSec: number | null;
  hr: number | null;
  elev: number | null;
};

const MAX_POINTS = 220;

function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    out.push(arr[Math.round(i * step)]);
  }
  return out;
}

function buildSeries(streams: StravaStreams): ChartPoint[] {
  const dist = streams.distance?.data as number[] | undefined;
  if (!dist?.length) return [];

  const vel = streams.velocity_smooth?.data as number[] | undefined;
  const hr = streams.heartrate?.data as number[] | undefined;
  const alt = streams.altitude?.data as number[] | undefined;

  const raw: ChartPoint[] = [];
  for (let i = 0; i < dist.length; i++) {
    const mps = vel?.[i];
    const paceSec =
      mps != null && mps > 0.5 ? 1000 / mps : null;
    // Clamp absurd GPS spikes for chart readability
    const pace =
      paceSec != null && paceSec >= 150 && paceSec <= 900 ? paceSec : null;
    raw.push({
      km: Math.round((dist[i] / 1000) * 100) / 100,
      paceSec: pace,
      hr: hr?.[i] && hr[i] > 0 ? Math.round(hr[i]) : null,
      elev: alt?.[i] != null ? Math.round(alt[i]) : null,
    });
  }
  return downsample(raw, MAX_POINTS);
}

function TooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{p.km.toFixed(2)} km</p>
      <ul className="mt-1 space-y-0.5 text-zinc-300">
        <li>Pace {p.paceSec != null ? secondsToPace(p.paceSec) : "—"}</li>
        <li>HR {p.hr != null ? `${p.hr} bpm` : "—"}</li>
        <li>Elev {p.elev != null ? `${p.elev} m` : "—"}</li>
      </ul>
    </div>
  );
}

export function ActivityStreamsChart({
  streams,
}: {
  streams: StravaStreams | null;
}) {
  const data = useMemo(
    () => (streams ? buildSeries(streams) : []),
    [streams],
  );

  if (data.length < 2) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-zinc-500">
        No stream data to chart for this run.
      </div>
    );
  }

  const hasPace = data.some((d) => d.paceSec != null);
  const hasHr = data.some((d) => d.hr != null);
  const hasElev = data.some((d) => d.elev != null);

  return (
    <div className="h-72 w-full rounded-xl border border-white/10 bg-white/[0.03] px-2 py-4 sm:px-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
          <XAxis
            dataKey="km"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v: number) => `${v.toFixed(1)}`}
            stroke="#71717a"
            tick={{ fill: "#71717a", fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            label={{
              value: "km",
              position: "insideBottomRight",
              offset: -4,
              fill: "#52525b",
              fontSize: 11,
            }}
          />
          {hasPace && (
            <YAxis
              yAxisId="pace"
              reversed
              stroke="#71717a"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v: number) =>
                secondsToPace(v).replace("/km", "")
              }
            />
          )}
          {(hasHr || hasElev) && (
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#71717a"
              tick={{ fill: "#71717a", fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={40}
            />
          )}
          <Tooltip content={<TooltipBody />} />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(v) => <span className="text-zinc-400">{v}</span>}
          />
          {hasElev && (
            <Area
              yAxisId="right"
              type="monotone"
              dataKey="elev"
              name="Elevation"
              fill="rgba(163, 230, 53, 0.15)"
              stroke="#a3e635"
              strokeWidth={1}
              dot={false}
              isAnimationActive={false}
            />
          )}
          {hasPace && (
            <Line
              yAxisId="pace"
              type="monotone"
              dataKey="paceSec"
              name="Pace"
              stroke="#fc4c02"
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
          {hasHr && (
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="hr"
              name="HR"
              stroke="#f43f5e"
              strokeWidth={1.5}
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
