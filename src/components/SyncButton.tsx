"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      let pending: number[] = [];
      let synced = 0;
      let insightsSaved = 0;

      const first = await fetch("/api/sync/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await first.json();
      if (!first.ok) throw new Error(data.error ?? "Sync failed");

      synced = data.synced ?? 0;
      insightsSaved = data.insightsSaved ?? 0;
      pending = data.pendingAnalyzeIds ?? [];

      while (pending.length > 0) {
        setMessage(`Analyzing… (${pending.length} left)`);
        const next = await fetch("/api/sync/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analyzeIds: pending }),
        });
        const nextData = await next.json();
        if (!next.ok) throw new Error(nextData.error ?? "Analyze failed");
        insightsSaved += nextData.insightsSaved ?? 0;
        pending = nextData.pendingAnalyzeIds ?? [];
      }

      if (synced > 0 || insightsSaved > 0) {
        setMessage(
          synced > 0
            ? `Synced ${synced} runs`
            : "Runs up to date · analysis refreshed",
        );
      } else {
        setMessage("Already up to date");
      }
      router.refresh();
      setTimeout(() => setMessage(null), 2500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleSync}
        disabled={loading}
        className="rounded-lg bg-[#fc4c02]/90 px-4 py-2 text-sm font-medium text-white transition hover:bg-[#fc4c02] disabled:opacity-50"
      >
        {loading ? "Syncing…" : "Sync runs"}
      </button>
      {message && (
        <span
          className={`max-w-md text-sm ${
            message.includes("failed") || message.includes("permission")
              ? "text-red-300"
              : "text-zinc-400"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
