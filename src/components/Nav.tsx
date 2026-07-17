"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Nav({ athleteName }: { athleteName?: string | null }) {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/lab", label: "Lab" },
    { href: "/wrapped", label: "Wrapped" },
  ];

  return (
    <header className="border-b border-white/10 bg-[#0f1419]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/icon.png" alt="Run Decode" className="h-8 w-8 rounded-lg" />
          <span className="font-semibold tracking-tight text-white">Run Decode</span>
        </Link>

        <nav className="flex items-center gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                pathname === link.href ||
                (link.href !== "/" && pathname.startsWith(link.href))
                  ? "bg-white/10 text-white"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {athleteName && (
          <span className="hidden text-sm text-zinc-500 sm:block">{athleteName}</span>
        )}
      </div>
    </header>
  );
}
