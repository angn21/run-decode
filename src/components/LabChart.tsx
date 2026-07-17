"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_LAB_CHART_METRICS,
  LAB_CHART_METRICS,
  LAB_CHART_MODES,
  ZONE_COLORS,
  formatAxisTick,
  formatMetricValue,
  type LabChartData,
  type LabChartMetricDef,
  type LabChartMetricId,
  type LabChartMode,
  type LabChartUnit,
  type LabTrendDay,
} from "@/lib/lab-chart";

const STORAGE_KEY = "run-decode-lab-chart-v3";

type StoredPrefs = {
  metrics: LabChartMetricId[];
  showPrior: boolean;
  mode: LabChartMode;
};

function loadPrefs(): StoredPrefs | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredPrefs;
    if (!Array.isArray(parsed.metrics)) return null;
    const valid = parsed.metrics.filter((id) =>
      LAB_CHART_METRICS.some((m) => m.id === id),
    ) as LabChartMetricId[];
    if (valid.length === 0) return null;
    const mode = LAB_CHART_MODES.some((m) => m.id === parsed.mode)
      ? parsed.mode
      : "cumulative";
    return { metrics: valid, showPrior: !!parsed.showPrior, mode };
  } catch {
    return null;
  }
}

function savePrefs(prefs: StoredPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

function metricDef(id: LabChartMetricId): LabChartMetricDef {
  return LAB_CHART_METRICS.find((m) => m.id === id)!;
}

function assignAxes(metrics: LabChartMetricId[]): {
  leftUnit: LabChartUnit | null;
  rightUnit: LabChartUnit | null;
  yAxisIdFor: (id: LabChartMetricId) => "left" | "right";
} {
  const units: LabChartUnit[] = [];
  for (const id of metrics) {
    const u = metricDef(id).unit;
    if (!units.includes(u)) units.push(u);
  }
  const leftUnit = units[0] ?? null;
  const rightUnit = units[1] ?? null;
  return {
    leftUnit,
    rightUnit,
    yAxisIdFor: (id) => {
      const u = metricDef(id).unit;
      if (rightUnit && u === rightUnit) return "right";
      return "left";
    },
  };
}

function CumTooltip({
  active,
  payload,
  metrics,
  showPrior,
}: {
  active?: boolean;
  payload?: Array<{ payload: LabTrendDay }>;
  metrics: LabChartMetricId[];
  showPrior: boolean;
}) {
  if (!active || !payload?.length) return null;
  const day = payload[0]?.payload;
  if (!day) return null;
  return (
    <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-white">{day.label}</p>
      {showPrior && day.priorLabel ? (
        <p className="text-xs text-zinc-500">vs {day.priorLabel} (prior)</p>
      ) : (
        <p className="text-xs text-zinc-500">Cumulative</p>
      )}
      <ul className="mt-2 space-y-1.5">
        {metrics.map((id) => {
          const def = metricDef(id);
          const prior =
            id === "distanceKm"
              ? day.distanceKmPrior
              : id === "movingTimeSec"
                ? day.movingTimeSecPrior
                : day.elevationMPrior;
          return (
            <li key={id} className="space-y-0.5">
              <div className="flex items-center gap-2 text-zinc-300">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: def.color }}
                />
                <span className="text-zinc-500">{def.label}</span>
                <span className="ml-auto text-white">
                  {formatMetricValue(id, day[id])}
                </span>
              </div>
              {showPrior ? (
                <div className="flex items-center gap-2 pl-4 text-xs text-zinc-500">
                  prior
                  <span className="ml-auto text-zinc-400">
                    {formatMetricValue(id, prior)}
                  </span>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LabChart({ data }: { data: LabChartData }) {
  const [metrics, setMetrics] = useState<LabChartMetricId[]>(
    DEFAULT_LAB_CHART_METRICS,
  );
  const [showPrior, setShowPrior] = useState(true);
  const [mode, setMode] = useState<LabChartMode>("cumulative");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const prefs = loadPrefs();
    if (prefs) {
      setMetrics(prefs.metrics);
      setShowPrior(prefs.showPrior);
      setMode(prefs.mode);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    savePrefs({ metrics, showPrior, mode });
  }, [metrics, showPrior, mode, hydrated]);

  const includePrior = showPrior && data.hasPrior;
  const { leftUnit, rightUnit, yAxisIdFor } = useMemo(
    () => assignAxes(metrics),
    [metrics],
  );

  const unused = LAB_CHART_METRICS.filter((m) => !metrics.includes(m.id));
  const tickInterval =
    data.dayCount <= 14
      ? 0
      : data.dayCount <= 45
        ? 2
        : Math.ceil(data.dayCount / 10);
  const ticks = data.days
    .filter((_, i) => i % (tickInterval + 1) === 0)
    .map((d) => d.dayIndex);

  function addMetric(id: LabChartMetricId) {
    setMetrics((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }

  function removeMetric(id: LabChartMetricId) {
    setMetrics((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((m) => m !== id);
    });
  }

  const xAxis = (
    <XAxis
      dataKey="dayIndex"
      type="number"
      domain={[0, Math.max(0, data.dayCount - 1)]}
      ticks={ticks}
      tickFormatter={(v: number) => data.days[v]?.label ?? String(v)}
      stroke="#71717a"
      tick={{ fill: "#71717a", fontSize: 12 }}
      tickLine={false}
      axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
    />
  );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500">
            Chart
          </p>
          <h2 className="text-lg font-semibold text-white">
            {mode === "cumulative"
              ? "Cumulative trends"
              : mode === "daily_volume"
                ? "Daily volume"
                : mode === "avg_hr"
                  ? "Avg HR by day"
                  : "Zone-time trend"}
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            Switch modes to explore volume, effort, and zones vs prior.
          </p>
        </div>
        {data.hasPrior && (
          <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-400">
            <input
              type="checkbox"
              checked={showPrior}
              onChange={(e) => setShowPrior(e.target.checked)}
              className="rounded border-white/20 bg-white/5 text-[#fc4c02] focus:ring-[#fc4c02]/40"
            />
            Compare prior period
            {data.priorPeriodLabel ? (
              <span className="text-zinc-600">({data.priorPeriodLabel})</span>
            ) : null}
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {LAB_CHART_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            disabled={m.id === "zone_time" && !data.hasZoneStreams}
            className={`rounded-lg px-3 py-1.5 text-sm transition disabled:opacity-40 ${
              mode === m.id
                ? "bg-white/10 text-white"
                : "text-zinc-500 hover:text-white"
            }`}
            title={
              m.id === "zone_time" && !data.hasZoneStreams
                ? "Load split data to unlock zone trends"
                : undefined
            }
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === "cumulative" && (
        <div className="flex flex-wrap items-center gap-2">
          {metrics.map((id) => {
            const def = metricDef(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => removeMetric(id)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-zinc-200 transition hover:border-white/25"
                title="Remove metric"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: def.color }}
                />
                {def.label}
                <span className="text-zinc-500">×</span>
              </button>
            );
          })}
          {unused.length > 0 && (
            <select
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-sm text-zinc-300"
              value=""
              onChange={(e) => {
                const id = e.target.value as LabChartMetricId;
                if (id) addMetric(id);
              }}
              aria-label="Add metric"
            >
              <option value="">Add metric…</option>
              {unused.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {!data.hasRuns ? (
        <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-12 text-center text-sm text-zinc-500">
          No runs in this period to chart.
        </div>
      ) : (
        <div className="h-80 w-full rounded-xl border border-white/10 bg-white/[0.03] px-2 py-4 sm:px-4">
          <ResponsiveContainer width="100%" height="100%">
            {mode === "cumulative" ? (
              <LineChart
                data={data.days}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                {xAxis}
                {leftUnit && (
                  <YAxis
                    yAxisId="left"
                    stroke="#71717a"
                    tick={{ fill: "#71717a", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) => formatAxisTick(leftUnit, v)}
                  />
                )}
                {rightUnit && (
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#71717a"
                    tick={{ fill: "#71717a", fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    width={56}
                    tickFormatter={(v: number) =>
                      formatAxisTick(rightUnit, v)
                    }
                  />
                )}
                <Tooltip
                  content={
                    <CumTooltip metrics={metrics} showPrior={includePrior} />
                  }
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => (
                    <span className="text-zinc-400">{v}</span>
                  )}
                />
                {metrics.map((id) => {
                  const def = metricDef(id);
                  return (
                    <Line
                      key={id}
                      yAxisId={yAxisIdFor(id)}
                      type="linear"
                      dataKey={id}
                      name={def.label}
                      stroke={def.color}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  );
                })}
                {includePrior &&
                  metrics.map((id) => {
                    const def = metricDef(id);
                    return (
                      <Line
                        key={`${id}-prior`}
                        yAxisId={yAxisIdFor(id)}
                        type="linear"
                        dataKey={`${id}Prior`}
                        name={`${def.label} (prior)`}
                        stroke={def.color}
                        strokeWidth={1.5}
                        strokeDasharray="5 4"
                        strokeOpacity={0.55}
                        dot={false}
                        isAnimationActive={false}
                        legendType="plainline"
                      />
                    );
                  })}
              </LineChart>
            ) : mode === "daily_volume" ? (
              <ComposedChart
                data={data.days}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                {xAxis}
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const day = payload[0].payload as LabTrendDay;
                    return (
                      <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm">
                        <p className="font-medium text-white">{day.label}</p>
                        <p className="text-zinc-300">
                          {day.dailyKm.toFixed(1)} km
                        </p>
                        {includePrior && day.dailyKmPrior != null ? (
                          <p className="text-xs text-zinc-500">
                            Prior ({day.priorLabel}):{" "}
                            {day.dailyKmPrior.toFixed(1)} km
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => (
                    <span className="text-zinc-400">{v}</span>
                  )}
                />
                <Bar
                  dataKey="dailyKm"
                  name="Distance"
                  fill="#fc4c02"
                  opacity={0.85}
                  isAnimationActive={false}
                />
                {includePrior && (
                  <Bar
                    dataKey="dailyKmPrior"
                    name="Prior"
                    fill="#fc4c02"
                    opacity={0.25}
                    isAnimationActive={false}
                  />
                )}
              </ComposedChart>
            ) : mode === "avg_hr" ? (
              <LineChart
                data={data.days}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                {xAxis}
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={["auto", "auto"]}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const day = payload[0].payload as LabTrendDay;
                    return (
                      <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm">
                        <p className="font-medium text-white">{day.label}</p>
                        <p className="text-zinc-300">
                          {day.avgHr != null ? `${day.avgHr} bpm` : "—"}
                        </p>
                        {includePrior ? (
                          <p className="text-xs text-zinc-500">
                            Prior:{" "}
                            {day.avgHrPrior != null
                              ? `${day.avgHrPrior} bpm`
                              : "—"}
                          </p>
                        ) : null}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => (
                    <span className="text-zinc-400">{v}</span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="avgHr"
                  name="Avg HR"
                  stroke="#f43f5e"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
                {includePrior && (
                  <Line
                    type="monotone"
                    dataKey="avgHrPrior"
                    name="Prior HR"
                    stroke="#f43f5e"
                    strokeWidth={1.5}
                    strokeDasharray="5 4"
                    strokeOpacity={0.55}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            ) : (
              <ComposedChart
                data={data.days}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
              >
                <CartesianGrid
                  stroke="rgba(255,255,255,0.06)"
                  vertical={false}
                />
                {xAxis}
                <YAxis
                  stroke="#71717a"
                  tick={{ fill: "#71717a", fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const day = payload[0].payload as LabTrendDay;
                    if (!day.hasZoneData) {
                      return (
                        <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm text-zinc-500">
                          {day.label} · no HR streams
                        </div>
                      );
                    }
                    return (
                      <div className="rounded-lg border border-white/15 bg-[#12161d] px-3 py-2 text-sm">
                        <p className="font-medium text-white">{day.label}</p>
                        {(["z1", "z2", "z3", "z4", "z5"] as const).map(
                          (k, i) => (
                            <p key={k} className="text-zinc-300">
                              <span style={{ color: ZONE_COLORS[i] }}>
                                Z{i + 1}
                              </span>{" "}
                              {day[k]}%
                              {includePrior && day[`${k}Prior`] != null
                                ? ` · prior ${day[`${k}Prior`]}%`
                                : ""}
                            </p>
                          ),
                        )}
                      </div>
                    );
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => (
                    <span className="text-zinc-400">{v}</span>
                  )}
                />
                {(["z1", "z2", "z3", "z4", "z5"] as const).map((k, i) => (
                  <Area
                    key={k}
                    type="monotone"
                    dataKey={k}
                    name={`Z${i + 1}`}
                    stackId="zones"
                    fill={ZONE_COLORS[i]}
                    stroke={ZONE_COLORS[i]}
                    fillOpacity={0.7}
                    isAnimationActive={false}
                  />
                ))}
                {includePrior &&
                  (["z1Prior", "z2Prior", "z3Prior", "z4Prior", "z5Prior"] as const).map(
                    (k, i) => (
                      <Area
                        key={k}
                        type="monotone"
                        dataKey={k}
                        name={`Z${i + 1} prior`}
                        stackId="zonesPrior"
                        fill={ZONE_COLORS[i]}
                        stroke={ZONE_COLORS[i]}
                        fillOpacity={0.2}
                        strokeOpacity={0.4}
                        strokeDasharray="4 3"
                        legendType="none"
                        isAnimationActive={false}
                      />
                    ),
                  )}
              </ComposedChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
