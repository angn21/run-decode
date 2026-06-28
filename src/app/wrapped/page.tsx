import Link from "next/link";
import { Nav } from "@/components/Nav";
import { WrappedView } from "@/components/WrappedView";
import { getCurrentAthlete } from "@/lib/session";
import { getActivitiesForAthlete } from "@/lib/strava";
import { computeWrapped } from "@/lib/wrapped";
import type { ActivityRow } from "@/lib/db";
import { isProductionDbConfigured } from "@/lib/db-config";
import { TursoSetupPrompt } from "@/components/TursoSetupPrompt";

export default async function WrappedPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period = params.period === "month" ? "month" : "week";

  if (!isProductionDbConfigured()) {
    return (
      <div className="min-h-screen bg-[#0a0e14]">
        <Nav />
        <main className="mx-auto max-w-3xl px-4 py-8">
          <TursoSetupPrompt />
        </main>
      </div>
    );
  }

  const athlete = await getCurrentAthlete();
  const activities = athlete
    ? ((await getActivitiesForAthlete(athlete.id, 200)) as ActivityRow[])
    : [];

  const stats = computeWrapped(activities, period);
  const athleteName = athlete
    ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
    : null;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <Nav athleteName={athleteName} />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">
          ← Dashboard
        </Link>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-[#fc4c02]">
              Run Wrapped
            </p>
            <h1 className="text-2xl font-bold text-white">Your {period}</h1>
          </div>
          <div className="flex gap-2">
            <PeriodToggle current={period} target="week" />
            <PeriodToggle current={period} target="month" />
          </div>
        </div>

        {activities.length === 0 ? (
          <p className="text-zinc-500">Connect Strava and sync runs to see your wrap.</p>
        ) : (
          <WrappedView stats={stats} period={period} athleteName={athleteName} />
        )}
      </main>
    </div>
  );
}

function PeriodToggle({
  current,
  target,
}: {
  current: string;
  target: string;
}) {
  const active = current === target;
  return (
    <Link
      href={`/wrapped?period=${target}`}
      className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
        active
          ? "bg-white/10 text-white"
          : "text-zinc-500 hover:text-white"
      }`}
    >
      {target}
    </Link>
  );
}
