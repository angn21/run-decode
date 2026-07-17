import type { DecodeResult } from "@/lib/decoder";
import type { StravaStreams } from "@/lib/strava";
import { ActivityStreamsChart } from "@/components/ActivityStreamsChart";
import { ActivityRouteMap } from "@/components/ActivityRouteMap";

export function PaceDecoderView({
  result,
  streams,
  polyline,
}: {
  result: DecodeResult;
  streams?: StravaStreams | null;
  polyline?: string | null;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-transparent p-6">
        <p className="text-xs uppercase tracking-wider text-teal-400">Verdict</p>
        <p className="mt-2 text-lg font-medium leading-relaxed text-white">
          {result.verdict}
        </p>
        {result.verdictStats.length > 0 && (
          <ul className="mt-4 space-y-1.5 text-sm leading-relaxed text-zinc-400">
            {result.verdictStats.map((stat, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-600" aria-hidden>
                  •
                </span>
                <span>{stat}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(streams || polyline) && (
        <div className="space-y-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-500">
              Run profile
            </p>
            <h2 className="text-lg font-semibold text-white">
              Pace, HR & elevation
            </h2>
          </div>
          <ActivityStreamsChart streams={streams ?? null} />
          <ActivityRouteMap polyline={polyline} />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {result.insights.map((insight, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 ${
              insight.tone === "positive"
                ? "border-teal-500/20 bg-teal-500/5"
                : insight.tone === "caution"
                  ? "border-amber-500/20 bg-amber-500/5"
                  : "border-white/10 bg-white/5"
            }`}
          >
            <p className="text-lg">{insight.icon}</p>
            <p className="mt-2 font-medium text-white">{insight.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              {insight.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
