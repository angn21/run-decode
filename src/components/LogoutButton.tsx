"use client";

export function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      className="rounded-lg border border-white/15 px-4 py-2 text-sm text-zinc-300 transition hover:border-white/30 hover:text-white"
    >
      Logout
    </button>
  );
}
