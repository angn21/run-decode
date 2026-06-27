import type { DecodeResult } from "@/lib/decoder";

export function PaceDecoderView({ result }: { result: DecodeResult }) {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-teal-500/30 bg-gradient-to-br from-teal-500/10 to-transparent p-6">
        <p className="text-xs uppercase tracking-wider text-teal-400">Verdict</p>
        <p className="mt-2 text-lg font-medium leading-relaxed text-white">
          {result.verdict}
        </p>
      </div>

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
