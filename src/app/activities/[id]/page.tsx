import { notFound } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Nav } from "@/components/Nav";
import { PaceDecoderView } from "@/components/PaceDecoderView";
import { getCurrentAthlete } from "@/lib/session";
import {
  fetchActivityStreams,
  getActivityByStravaId,
  saveInsights,
  saveStreams,
} from "@/lib/strava";
import { decodeActivity } from "@/lib/decoder";
import type { ActivityRow } from "@/lib/db";
import type { StravaStreams } from "@/lib/strava";
import { speedToPace, secondsToDuration } from "@/lib/format";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const stravaId = Number(id);
  const athlete = await getCurrentAthlete();
  if (!athlete) notFound();

  const activity = getActivityByStravaId(stravaId) as ActivityRow | undefined;
  if (!activity) notFound();

  let streams: StravaStreams | null = null;
  if (activity.streams_json) {
    streams = JSON.parse(activity.streams_json);
  } else {
    try {
      streams = await fetchActivityStreams(athlete, stravaId);
      saveStreams(stravaId, streams);
    } catch {
      streams = null;
    }
  }

  let result;
  if (activity.insights_json) {
    result = JSON.parse(activity.insights_json);
  } else {
    result = await decodeActivity(activity, streams);
    saveInsights(stravaId, result);
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
            {format(parseISO(activity.start_date), "EEEE, MMM d · h:mm a")} ·{" "}
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
