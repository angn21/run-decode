import Link from "next/link";
import type { ActivityRow } from "@/lib/db";
import { buildActivityTeaser } from "@/lib/activity-teaser";
import { speedToPace, secondsToDuration } from "@/lib/format";
import { formatInRunTimezone } from "@/lib/timezone";

export function ActivityList({
  activities,
  allActivities,
}: {
  activities: ActivityRow[];
  allActivities: ActivityRow[];
}) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No runs yet. Hit sync or connect Strava to pull your activities.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => {
        const teaser = buildActivityTeaser(activity, allActivities);

        return (
          <Link
            key={activity.strava_id}
            href={`/activities/${activity.strava_id}`}
            className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-teal-500/30 hover:bg-white/10"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-white">{activity.name}</p>
              <p className="text-xs text-zinc-500">
                {formatInRunTimezone(activity.start_date, "EEE, MMM d · h:mm a")}
              </p>
              <p className="mt-1 truncate text-xs text-teal-400/80">{teaser}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium text-teal-400">
                {speedToPace(activity.average_speed)}
              </p>
              <p className="text-xs text-zinc-500">
                {(activity.distance / 1000).toFixed(1)} km ·{" "}
                {secondsToDuration(activity.moving_time)}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
