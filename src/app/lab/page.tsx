import Link from "next/link";
import { Nav } from "@/components/Nav";
import { LabView } from "@/components/LabView";
import { getCurrentAthlete } from "@/lib/session";
import { fetchAthleteHrZones, getActivitiesForAthlete } from "@/lib/strava";
import { computeLabStats, parseLabPeriod } from "@/lib/lab";
import { buildLabChartData } from "@/lib/lab-chart";
import type { ActivityRow } from "@/lib/db";
import { isProductionDbConfigured } from "@/lib/db-config";
import { TursoSetupPrompt } from "@/components/TursoSetupPrompt";

export default async function LabPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = parseLabPeriod(params);

  if (!isProductionDbConfigured()) {
    return (
      <div className="min-h-screen bg-[#0a0e14]">
        <Nav />
        <main className="mx-auto max-w-5xl px-4 py-8">
          <TursoSetupPrompt />
        </main>
      </div>
    );
  }

  const athlete = await getCurrentAthlete();
  const activities = athlete
    ? ((await getActivitiesForAthlete(athlete.id, 1000)) as ActivityRow[])
    : [];

  const stravaHrZones = athlete ? await fetchAthleteHrZones(athlete) : null;
  const stats = computeLabStats(activities, period, stravaHrZones);
  const chartData = buildLabChartData(activities, period);
  const athleteName = athlete
    ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
    : null;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <Nav athleteName={athleteName} />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">
          ← Dashboard
        </Link>

        <div>
          <p className="text-xs uppercase tracking-wider text-[#fc4c02]">Lab</p>
          <h1 className="text-2xl font-bold text-white">Explore your data</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Pick a timeframe, dig into the numbers, share a card.
          </p>
        </div>

        {!athlete ? (
          <p className="text-zinc-500">
            Connect Strava on the dashboard to use Lab.
          </p>
        ) : (
          <LabView
            stats={stats}
            period={period}
            athleteName={athleteName}
            chartData={chartData}
            allActivities={activities.map((a) => ({
              streams_json: a.streams_json,
            }))}
          />
        )}
      </main>
    </div>
  );
}
