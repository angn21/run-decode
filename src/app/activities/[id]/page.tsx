import { notFound } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { PaceDecoderView } from "@/components/PaceDecoderView";
import { getCurrentAthlete } from "@/lib/session";
import {
  fetchActivityDetail,
  fetchActivityStreams,
  getActivitiesForAthlete,
  getActivityForAthlete,
  saveActivity,
  saveInsights,
  saveStreams,
} from "@/lib/strava";
import {
  decodeActivity,
  isCachedDecodeValid,
  type CachedDecodeResult,
  type DecodeResult,
} from "@/lib/decoder";
import type { ActivityRow } from "@/lib/db";
import type { StravaStreams } from "@/lib/strava";
import { speedToPace, secondsToDuration } from "@/lib/format";
import { formatInRunTimezone } from "@/lib/timezone";
import { isProductionDbConfigured } from "@/lib/db-config";
import { TursoSetupPrompt } from "@/components/TursoSetupPrompt";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stravaId = Number(id);

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
  if (!athlete) notFound();

  const recentActivities = (await getActivitiesForAthlete(
    athlete.id,
    50,
  )) as ActivityRow[];

  let activity = await getActivityForAthlete(stravaId, athlete.id);
  if (!activity) {
    try {
      const stravaActivity = await fetchActivityDetail(athlete, stravaId);
      await saveActivity(athlete.id, stravaActivity);
      activity = await getActivityForAthlete(stravaId, athlete.id);
    } catch {
      notFound();
    }
  }

  if (!activity || activity.athlete_id !== athlete.id) notFound();

  let streams: StravaStreams | null = null;
  if (activity.streams_json) {
    streams = JSON.parse(activity.streams_json);
  } else {
    try {
      streams = await fetchActivityStreams(athlete, stravaId);
      await saveStreams(stravaId, streams);
    } catch {
      streams = null;
    }
  }

  let result: DecodeResult;
  const cached = activity.insights_json
    ? (JSON.parse(activity.insights_json) as CachedDecodeResult)
    : null;

  if (isCachedDecodeValid(cached)) {
    result = cached;
  } else {
    result = await decodeActivity(activity, streams, recentActivities);
    await saveInsights(stravaId, result);
  }

  const athleteName = `${athlete.firstname ?? ""} ${athlete.lastname ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-[#0a0e14]">
      <Nav athleteName={athleteName} />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
        <Link href="/" className="text-sm text-zinc-500 hover:text-white">
          ← Dashboard
        </Link>

        <div>
          <p className="text-xs uppercase tracking-wider text-[#fc4c02]">
            Pace Decoder
          </p>
          <h1 className="mt-1 text-2xl font-bold text-white">{activity.name}</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatInRunTimezone(activity.start_date, "EEEE, MMM d · h:mm a")} ·{" "}
            {(activity.distance / 1000).toFixed(1)} km ·{" "}
            {secondsToDuration(activity.moving_time)} ·{" "}
            {speedToPace(activity.average_speed)}
          </p>
        </div>

        <PaceDecoderView result={result} />
      </main>
    </div>
  );
}
