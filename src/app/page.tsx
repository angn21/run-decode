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
  searchParams: Promise<{ error?: string; synced?: string; sync_warning?: string }>;
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
  // Load full history for coach/milestones/streak (was capped at 50 → shifting first 5K + stuck streak)
  const COACH_HISTORY_LIMIT = 1000;
  const activities = athlete
    ? ((await getActivitiesForAthlete(
        athlete.id,
        COACH_HISTORY_LIMIT,
      )) as ActivityRow[])
    : [];
  // #region agent log
  if (athlete) {
    const { dbGet } = await import("@/lib/db");
    const totalRow = await dbGet<{ n: number }>(
      `SELECT COUNT(*) as n FROM activities WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run')`,
      [athlete.id],
    );
    const oldestRow = await dbGet<{ start_date: string; distance: number }>(
      `SELECT start_date, distance FROM activities WHERE athlete_id = ? AND (type = 'Run' OR sport_type = 'Run') AND distance >= 4800 ORDER BY start_date ASC LIMIT 1`,
      [athlete.id],
    );
    fetch("http://127.0.0.1:7701/ingest/f2c265a6-137d-495f-9ecf-e98360205356", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "9efdf0",
      },
      body: JSON.stringify({
        sessionId: "9efdf0",
        runId: "post-fix",
        hypothesisId: "A,B,C",
        location: "page.tsx:HomePage",
        message: "activity load vs full history",
        data: {
          loadedCount: activities.length,
          loadLimit: COACH_HISTORY_LIMIT,
          dbTotalRuns: totalRow?.n ?? null,
          oldestInLoaded: activities[activities.length - 1]?.start_date ?? null,
          newestInLoaded: activities[0]?.start_date ?? null,
          trueFirst5kInDb: oldestRow?.start_date ?? null,
          trueFirst5kDistance: oldestRow?.distance ?? null,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
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
        {params.error === "redirect_mismatch" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Strava redirect URI mismatch. Set{" "}
            <code className="text-red-200">NEXT_PUBLIC_APP_URL</code> to exactly{" "}
            <code className="text-red-200">https://run-decode.vercel.app</code>{" "}
            (no trailing slash) in Vercel, and set Strava callback domain to{" "}
            <code className="text-red-200">run-decode.vercel.app</code>.
          </div>
        )}
        {params.error === "code_expired" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            That login link was already used or expired (common on mobile). Tap{" "}
            <strong>Connect with Strava</strong> once more — don&apos;t refresh
            this page.
          </div>
        )}
        {params.error === "token_exchange" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Strava token exchange failed. Double-check{" "}
            <code className="text-red-200">STRAVA_CLIENT_ID</code> and{" "}
            <code className="text-red-200">STRAVA_CLIENT_SECRET</code> in Vercel,
            then try Connect again (OAuth codes are single-use).
          </div>
        )}
        {params.error === "db_error" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Database error during sign-in. Verify{" "}
            <code className="text-red-200">TURSO_DATABASE_URL</code> starts with{" "}
            <code className="text-red-200">libsql://</code> and{" "}
            <code className="text-red-200">TURSO_AUTH_TOKEN</code> is correct.
          </div>
        )}
        {params.error === "auth_failed" && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Connection failed. Try Connect with Strava again — if it keeps
            failing, check Vercel env vars and redeploy.
          </div>
        )}
        {params.error && !["capacity_full", "db_not_configured", "redirect_mismatch", "token_exchange", "db_error", "auth_failed", "code_expired"].includes(params.error) && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            Connection failed: {params.error}
          </div>
        )}
        {params.synced && (
          <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 text-sm text-teal-300">
            Strava connected{params.sync_warning ? "" : " and runs synced"}!
            {params.sync_warning && (
              <span>
                {" "}
                Sync had an issue — hit <strong>Sync runs</strong> on the
                dashboard.
              </span>
            )}
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
                  className="rounded-lg border border-[#fc4c02]/30 bg-[#fc4c02]/10 px-3 py-1.5 text-sm text-[#fc4c02] hover:bg-[#fc4c02]/20"
                >
                  Share Wrapped →
                </Link>
              </div>
              <ActivityList
                activities={activities.slice(0, 10)}
                allActivities={activities}
              />
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
