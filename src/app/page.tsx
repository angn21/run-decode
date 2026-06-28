import Link from "next/link";
import { Nav } from "@/components/Nav";
import { SyncButton } from "@/components/SyncButton";
import { LogoutButton } from "@/components/LogoutButton";
import { CoachDashboard } from "@/components/CoachDashboard";
import { ActivityList } from "@/components/ActivityList";
import { getCurrentAthlete } from "@/lib/session";
import { getActivitiesForAthlete } from "@/lib/strava";
import { computeCoachStats } from "@/lib/coach";
import type { ActivityRow } from "@/lib/db";
import { isProductionDbConfigured } from "@/lib/db-config";
import { TursoSetupPrompt } from "@/components/TursoSetupPrompt";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; synced?: string }>;
}) {
  const params = await searchParams;

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
    ? ((await getActivitiesForAthlete(athlete.id, 50)) as ActivityRow[])
    : [];
  const coachStats = computeCoachStats(activities);

  const athleteName = athlete
    ? `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim()
    : null;

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <Nav athleteName={athleteName} />

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        {params.error === "capacity_full" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            This app has reached Strava&apos;s athlete limit (10 connected
            athletes). Ask the app owner to remove an existing connection in{" "}
            <a
              href="https://www.strava.com/settings/api"
              className="underline hover:text-white"
              target="_blank"
              rel="noopener noreferrer"
            >
              Strava API settings
            </a>
            .
          </div>
        )}
        {params.error === "db_not_configured" && (
          <TursoSetupPrompt />
        )}
        {params.error && params.error !== "capacity_full" && params.error !== "db_not_configured" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Connection failed: {params.error}
          </div>
        )}
        {params.synced && (
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-300">
            Strava connected and runs synced!
          </div>
        )}

        {!athlete ? (
          <ConnectPrompt />
        ) : (
          <>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h1 className="text-2xl font-bold text-white">
                  Hey{athlete.firstname ? `, ${athlete.firstname}` : ""}
                </h1>
                <p className="text-sm text-zinc-500">
                  {activities.length} runs in your history
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <SyncButton />
                <a
                  href="/api/auth/strava"
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white"
                >
                  Reconnect Strava
                </a>
                <LogoutButton />
              </div>
            </div>

            <CoachDashboard stats={coachStats} />

            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Recent runs</h2>
                <Link
                  href="/wrapped"
                  className="text-sm text-[#fc4c02] hover:underline"
                >
                  View Wrapped →
                </Link>
              </div>
              <ActivityList activities={activities.slice(0, 10)} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function ConnectPrompt() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 py-16 text-center">
      <img src="/icon.png" alt="" className="mb-6 h-20 w-20 rounded-2xl" />
      <h1 className="text-3xl font-bold text-white">Run Decode</h1>
      <p className="mt-3 max-w-md text-zinc-400">
        Decode your runs, track safe habits, and wrap your week — powered by your
        Strava data from Coros.
      </p>
      <a
        href="/api/auth/strava"
        className="mt-8 inline-flex items-center gap-2 rounded-xl bg-[#fc4c02] px-6 py-3 font-medium text-white transition hover:bg-[#e04400]"
      >
        Connect with Strava
      </a>
      <p className="mt-4 text-xs text-zinc-600">
        Manual tokens from Strava settings usually can&apos;t read activities — use
        Connect for full access.
      </p>
    </div>
  );
}
