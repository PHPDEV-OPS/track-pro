"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Wordmark } from "./logo";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/settings", label: "Settings" },
];

export function AppHeader() {
  const path = usePathname();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-1.5">
        <Link href="/dashboard" aria-label="track-pro, go to dashboard" className="inline-flex h-11 items-center rounded-lg text-base">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="flex items-center gap-0.5 text-sm sm:gap-1">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-11 items-center rounded-lg px-2.5 sm:px-3 ${
                  active ? "bg-accent-soft text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          <span className="ml-1 inline-flex sm:ml-2">
            <UserButton />
          </span>
        </nav>
      </div>
    </header>
  );
}
