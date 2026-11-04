import Link from "next/link";
import { buildDays } from "@/lib/heatmap";
import { Heatmap } from "@/components/heatmap";

// Decorative sample so the landing page shows the product without needing an account.
function sample() {
  const today = new Date().toISOString().slice(0, 10);
  const secByDay: Record<string, number> = {};
  let seed = 7;
  for (let i = 0; i < 365; i++) {
    seed = (seed * 9301 + 49297) % 233280;
    const r = seed / 233280;
    if (r > 0.45) {
      const d = new Date(`${today}T12:00:00`);
      d.setDate(d.getDate() - i);
      secByDay[d.toISOString().slice(0, 10)] = Math.floor(r * 5 * 3600);
    }
  }
  return buildDays(today, secByDay);
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-10 px-4 py-16">
      <div className="space-y-4">
        <p className="font-mono text-sm text-accent">track-pro</p>
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Every focused hour becomes a square you can see.
        </h1>
        <p className="max-w-xl text-muted">
          A minimal focus timer for builders. Start a session, finish it, and watch your year fill in like a
          contribution graph.
        </p>
        <div className="flex gap-3">
          <Link href="/sign-up" className="rounded-lg bg-accent px-5 py-2.5 font-medium text-accent-fg">
            Get started
          </Link>
          <Link href="/sign-in" className="rounded-lg border border-border px-5 py-2.5">
            Sign in
          </Link>
        </div>
      </div>
      <div aria-hidden className="pointer-events-none select-none">
        <Heatmap cells={sample()} />
      </div>
    </main>
  );
}
