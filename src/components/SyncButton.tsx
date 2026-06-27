"use client";

import { useState } from "react";

export function SyncButton() {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Sync failed");
      setMessage(`Synced ${data.synced} runs`);
      setTimeout(() => window.location.reload(), 800);
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
        <span className="max-w-md text-sm text-red-300">{message}</span>
      )}
    </div>
  );
}
