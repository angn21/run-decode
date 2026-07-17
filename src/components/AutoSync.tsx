"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type CheckResult = {
  upToDate?: boolean;
  throttled?: boolean;
  synced?: number;
  newRuns?: number;
  analyzed?: number;
  insightsSaved?: number;
  remaining?: number;
  pendingAnalyzeIds?: number[];
  error?: string;
};

export function AutoSync() {
  const router = useRouter();
  const ran = useRef(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;

    async function postCheck(body: Record<string, unknown>) {
      const res = await fetch("/api/sync/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as CheckResult;
      return { res, data };
    }

    async function runCheck() {
      try {
        setStatus("Checking for new runs…");
        const { res, data } = await postCheck({ force: false });
        if (!res.ok) {
          if (!cancelled) setStatus(data.error ?? "Auto-sync failed");
          return;
        }
        if (cancelled) return;

        if (data.throttled) {
          setStatus(null);
          return;
        }

        let pending = data.pendingAnalyzeIds ?? [];
        let changed =
          (data.synced ?? 0) > 0 ||
          (data.analyzed ?? 0) > 0 ||
          (data.insightsSaved ?? 0) > 0;

        while (pending.length > 0 && !cancelled) {
          setStatus(`Analyzing new runs… (${pending.length} left)`);
          const next = await postCheck({ analyzeIds: pending });
          if (!next.res.ok) break;
          pending = next.data.pendingAnalyzeIds ?? [];
          if (
            (next.data.analyzed ?? 0) > 0 ||
            (next.data.insightsSaved ?? 0) > 0
          ) {
            changed = true;
          }
        }

        if (cancelled) return;

        if (changed) {
          const parts: string[] = [];
          if (data.synced) parts.push(`${data.synced} new`);
          if (data.insightsSaved || changed) parts.push("analyzed");
          setStatus(
            parts.length > 0 ? `Updated · ${parts.join(" · ")}` : "Updated",
          );
          router.refresh();
          setTimeout(() => {
            if (!cancelled) setStatus(null);
          }, 2500);
        } else {
          setStatus(null);
        }
      } catch {
        if (!cancelled) setStatus(null);
      }
    }

    void runCheck();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!status) return null;

  return (
    <p className="text-sm text-zinc-500" aria-live="polite">
      {status}
    </p>
  );
}
