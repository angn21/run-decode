import type { GearRow } from "@/lib/db";

export function ShoesCard({
  gears,
}: {
  gears: GearRow[];
}) {
  const active = gears.filter((g) => !g.retired);
  const retired = gears.filter((g) => g.retired);

  if (gears.length === 0) {
    return (
      <section className="rounded-xl border border-white/10 bg-white/5 p-4">
        <h2 className="text-lg font-semibold text-white">Shoes</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Sync runs with shoes set in Strava to track mileage here.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-white">Shoes</h2>
        <p className="text-sm text-zinc-500">
          Mileage from Strava gear (lifetime on that pair).
        </p>
      </div>
      <ul className="space-y-2">
        {active.map((g) => (
          <ShoeRow key={g.id} gear={g} />
        ))}
      </ul>
      {retired.length > 0 && (
        <details className="text-sm text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">
            Retired ({retired.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {retired.map((g) => (
              <ShoeRow key={g.id} gear={g} muted />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ShoeRow({ gear, muted }: { gear: GearRow; muted?: boolean }) {
  const km = (gear.distance_m || 0) / 1000;
  const subtitle = [gear.brand_name, gear.model_name].filter(Boolean).join(" ");
  return (
    <li
      className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
        muted
          ? "border-white/5 bg-white/[0.02] text-zinc-500"
          : "border-white/10 bg-white/5"
      }`}
    >
      <div className="min-w-0">
        <p className={`truncate font-medium ${muted ? "text-zinc-400" : "text-white"}`}>
          {gear.name || "Shoes"}
        </p>
        {subtitle ? (
          <p className="truncate text-xs text-zinc-500">{subtitle}</p>
        ) : null}
      </div>
      <p
        className={`shrink-0 text-sm tabular-nums ${
          muted ? "text-zinc-500" : "text-zinc-200"
        }`}
      >
        {km.toFixed(0)} km
      </p>
    </li>
  );
}
