"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="size-2.5 rounded-full bg-accent" />
          track-pro
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-3 py-2 ${
                  active ? "bg-accent-soft text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="ml-2 inline-flex">
            <UserButton />
          </span>
        </nav>
      </div>
    </header>
  );
}
