import Link from "next/link";
import type { ActivityRow } from "@/lib/db";
import { speedToPace, secondsToDuration } from "@/lib/format";
import { format, parseISO } from "date-fns";

export function ActivityList({ activities }: { activities: ActivityRow[] }) {
  if (activities.length === 0) {
    return (
      <p className="text-sm text-zinc-500">
        No runs yet. Hit sync or connect Strava to pull your activities.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {activities.map((activity) => (
        <Link
          key={activity.strava_id}
          href={`/activities/${activity.strava_id}`}
          className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-teal-500/30 hover:bg-white/10"
        >
          <div>
            <p className="font-medium text-white">{activity.name}</p>
            <p className="text-xs text-zinc-500">
              {format(parseISO(activity.start_date), "EEE, MMM d · h:mm a")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-teal-400">
              {speedToPace(activity.average_speed)}
            </p>
            <p className="text-xs text-zinc-500">
              {(activity.distance / 1000).toFixed(1)} km ·{" "}
              {secondsToDuration(activity.moving_time)}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
