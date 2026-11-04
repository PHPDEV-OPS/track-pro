import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionDTO } from "@/actions/session";
import { applyLocal, loadQueue, queueKey, recordOffset, replay, saveQueue, serverNow, type QueuedOp, type SendResult } from "./offline-queue";

// A minimal in-memory localStorage, since tests run in node.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const t0 = new Date("2026-03-10T09:00:00Z").getTime();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const running: SessionDTO = {
  status: "RUNNING",
  targetSec: 3600,
  startedAt: iso(0),
  accumulatedSec: 0,
  lastResumedAt: iso(0),
  pausedAt: null,
  serverTime: iso(0),
};
const op = (o: QueuedOp["op"], ms: number): QueuedOp => ({ op: o, at: iso(ms) });

beforeEach(() => store.clear());

describe("queue storage (AC-1, AC-7)", () => {
  it("keeps each account's queue under its own key", () => {
    saveQueue("user_a", [op("pause", 1000)]);
    expect(store.has(queueKey("user_a"))).toBe(true);
    expect(loadQueue("user_b")).toEqual([]);
    expect(loadQueue("user_a")).toEqual([op("pause", 1000)]);
    saveQueue("user_a", []);
    expect(store.has(queueKey("user_a"))).toBe(false);
  });
});

describe("applyLocal mirrors the server math (AC-1)", () => {
  it("pauses at the queued time and resumes from it", () => {
    const paused = applyLocal(running, op("pause", 10 * 60_000))!;
    expect(paused).toMatchObject({ status: "PAUSED", accumulatedSec: 600, pausedAt: iso(600_000), lastResumedAt: null });
    expect(applyLocal(paused, op("resume", 20 * 60_000))).toMatchObject({ status: "RUNNING", lastResumedAt: iso(1_200_000) });
    expect(applyLocal(paused, op("complete", 0))).toBeNull();
  });
});

describe("clock offset (AC-3)", () => {
  it("stamps queued actions in server time", () => {
    recordOffset(new Date(t0 + 5000).toISOString(), t0);
    expect(serverNow(t0 + 1000)).toBe(t0 + 6000);
  });
});

describe("replay (AC-2, AC-5)", () => {
  const send = (results: SendResult[]) => {
    const sent: QueuedOp[] = [];
    const fn = async (o: QueuedOp) => {
      sent.push(o);
      return results.shift()!;
    };
    return { fn, sent };
  };

  it("sends in order and empties the queue", async () => {
    saveQueue("u", [op("pause", 1), op("resume", 2)]);
    const paused = { ...running, status: "PAUSED" as const };
    const { fn, sent } = send([{ kind: "ok", session: paused }, { kind: "ok", session: running }]);
    const out = await replay("u", fn);
    expect(sent.map((o) => o.op)).toEqual(["pause", "resume"]);
    expect(out).toEqual({ conflicts: [], offline: false, session: running });
    expect(loadQueue("u")).toEqual([]);
  });

  it("stops on a network failure, keeps the rest, and sends the time next attempt", async () => {
    saveQueue("u", [{ ...op("pause", 1), live: true }, op("resume", 2)]);
    const { fn } = send([{ kind: "network" }]);
    const out = await replay("u", fn);
    expect(out.offline).toBe(true);
    expect(loadQueue("u")).toEqual([{ ...op("pause", 1), live: false }, op("resume", 2)]);
  });

  it("drops a conflict and carries on", async () => {
    saveQueue("u", [op("pause", 1), op("complete", 2)]);
    const { fn } = send([{ kind: "conflict", code: "NO_SESSION" }, { kind: "ok", session: null }]);
    const out = await replay("u", fn);
    expect(out.conflicts).toEqual(["NO_SESSION"]);
    expect(out.session).toBeNull();
    expect(loadQueue("u")).toEqual([]);
  });

  it("retries an unexpected server error, then drops it after 3 tries", async () => {
    saveQueue("u", [op("pause", 1)]);
    for (let i = 0; i < 2; i++) {
      const out = await replay("u", send([{ kind: "error" }]).fn);
      expect(out.conflicts).toEqual([]);
      expect(loadQueue("u")[0].tries).toBe(i + 1);
    }
    const out = await replay("u", send([{ kind: "error" }]).fn);
    expect(out.conflicts).toEqual(["FAILED"]);
    expect(loadQueue("u")).toEqual([]);
  });

  it("picks up actions added while a replay is running", async () => {
    saveQueue("u", [op("pause", 1)]);
    const sent: string[] = [];
    await replay("u", async (o) => {
      sent.push(o.op);
      if (o.op === "pause") saveQueue("u", [...loadQueue("u"), op("resume", 2)]);
      return { kind: "ok", session: null };
    });
    expect(sent).toEqual(["pause", "resume"]);
  });
});
