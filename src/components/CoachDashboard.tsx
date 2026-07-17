import type { CoachStats } from "@/lib/coach";
import { formatPercent } from "@/lib/format";

export function CoachDashboard({ stats }: { stats: CoachStats }) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-white">Consistency Coach</h2>
        <p className="text-sm text-zinc-500">Are you building a safe habit?</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          label="This week"
          value={`${stats.thisWeekKm.toFixed(1)} km`}
          sub={`${stats.runCountThisWeek} runs · ${formatPercent(stats.mileageChange)} vs last`}
          alert={stats.tenPercentWarning}
        />
        <StatCard
          label="Easy / hard"
          value={stats.easyHardRatio}
          sub={`${stats.easyCount} easy · ${stats.hardCount} hard`}
        />
        <StatCard
          label="Weekly streak"
          value={`${stats.weeklyStreak} wk`}
          sub="2+ runs per week"
        />
        <StatCard
          label="Last week"
          value={`${stats.lastWeekKm.toFixed(1)} km`}
          sub="baseline"
        />
        <StatCard
          label="Avg pace (30d)"
          value={stats.avgPaceLast30}
          sub={`${stats.runsLast30} runs`}
        />
        <StatCard
          label="Avg HR (30d)"
          value={stats.avgHrLast30 != null ? `${stats.avgHrLast30} bpm` : "—"}
          sub={`${stats.runsLast30} runs`}
        />
        <StatCard
          label="Elevation (week)"
          value={stats.thisWeekElevM > 0 ? `${stats.thisWeekElevM} m` : "—"}
          sub={`${formatPercent(stats.elevChange)} vs last (${stats.lastWeekElevM} m)`}
        />
        <StatCard
          label="Relative effort"
          value={
            stats.thisWeekSuffer != null ? String(stats.thisWeekSuffer) : "—"
          }
          sub={
            stats.sufferChange != null
              ? `${formatPercent(stats.sufferChange)} vs last week`
              : "Strava suffer score sum"
          }
        />
      </div>

      <div className="space-y-3">
        {stats.insights.map((insight, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 ${
              insight.type === "warning"
                ? "border-amber-500/30 bg-amber-500/10"
                : insight.type === "success"
                  ? "border-teal-500/30 bg-teal-500/10"
                  : "border-white/10 bg-white/5"
            }`}
          >
            <p className="font-medium text-white">{insight.title}</p>
            <p className="mt-1 text-sm text-zinc-400">{insight.body}</p>
          </div>
        ))}
      </div>

      {stats.milestones.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium text-zinc-400">Milestones</h3>
          <div className="flex flex-wrap gap-2">
            {stats.milestones.map((m) => (
              <span
                key={m}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-zinc-300"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  alert,
}: {
  label: string;
  value: string;
  sub: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        alert ? "border-amber-500/40 bg-amber-500/5" : "border-white/10 bg-white/5"
      }`}
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}
