import { getDbConfigError } from "@/lib/db-config";

export function TursoSetupPrompt() {
  const detail = getDbConfigError();

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 px-8 py-16 text-center">
      <img src="/icon.png" alt="" className="mb-6 h-20 w-20 rounded-2xl" />
      <h1 className="text-2xl font-bold text-white">Database not configured</h1>
      <p className="mt-3 max-w-lg text-sm text-zinc-400">
        Run Decode on Vercel needs a Turso database for persistent storage.
        Add <code className="text-amber-200">TURSO_DATABASE_URL</code> and{" "}
        <code className="text-amber-200">TURSO_AUTH_TOKEN</code> in Vercel
        environment variables, then redeploy.
      </p>
      {detail && (
        <p className="mt-4 rounded-lg border border-amber-500/20 bg-black/20 px-4 py-2 text-sm text-amber-200">
          {detail}
        </p>
      )}
      <a
        href="https://docs.turso.tech/cli/installation"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-6 text-sm text-[#fc4c02] hover:underline"
      >
        Turso setup guide →
      </a>
    </div>
  );
}
