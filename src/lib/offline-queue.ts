import type { Conflict, SessionDTO } from "@/actions/session";
import { elapsedSec } from "@/lib/timer";

// Offline timer actions (spec 0003): queued per account in localStorage, replayed in order on reconnect.

export type QueuedOp = {
  op: "pause" | "resume" | "complete";
  /** When it happened, in server time (browser clock plus the measured offset). */
  at: string;
  entryId?: string;
  notes?: string;
  imageUrl?: string | null;
  /** Queued while online: the first send omits `at` so the server stamps it, exactly as before (AC-8). */
  live?: boolean;
  tries?: number;
};

export type SendResult =
  | { kind: "ok"; session: SessionDTO | null }
  | { kind: "conflict"; code: Conflict["conflict"] | "FAILED" }
  | { kind: "network" }
  | { kind: "error" };

export type ReplayOutcome = {
  /** The last session the server returned, or null after a complete. Undefined when nothing was sent. */
  session?: SessionDTO | null;
  conflicts: (Conflict["conflict"] | "FAILED")[];
  /** Stopped on a network failure; the rest stays queued. */
  offline: boolean;
};

const MAX_TRIES = 3;
const OFFSET_KEY = "trackpro.clockOffset";

export const queueKey = (userId: string) => `trackpro.queue.${userId}`;

export function loadQueue(userId: string): QueuedOp[] {
  try {
    const raw = localStorage.getItem(queueKey(userId));
    return raw ? (JSON.parse(raw) as QueuedOp[]) : [];
  } catch {
    return [];
  }
}

export function saveQueue(userId: string, q: QueuedOp[]) {
  try {
    if (q.length) localStorage.setItem(queueKey(userId), JSON.stringify(q));
    else localStorage.removeItem(queueKey(userId));
  } catch {
    /* storage can be unavailable; the action still applies in memory */
  }
}

/** Records how far the server clock is from this browser's, from a fresh server response. */
export function recordOffset(serverTime: string, clientNow = Date.now()) {
  const offset = new Date(serverTime).getTime() - clientNow;
  try {
    localStorage.setItem(OFFSET_KEY, String(offset));
  } catch {
    /* fall back to no correction */
  }
  return offset;
}

export function serverNow(clientNow = Date.now()) {
  let offset = 0;
  try {
    offset = Number(localStorage.getItem(OFFSET_KEY)) || 0;
  } catch {
    /* no stored offset */
  }
  return clientNow + offset;
}

/** The optimistic local version of what the server will do for this op, using the same math. */
export function applyLocal(s: SessionDTO | null, op: QueuedOp): SessionDTO | null {
  if (!s) return null;
  const at = op.at;
  if (op.op === "complete") return null;
  if (op.op === "pause") {
    if (s.status === "PAUSED") return s;
    return {
      ...s,
      status: "PAUSED",
      accumulatedSec: elapsedSec(s, new Date(at).getTime()),
      lastResumedAt: null,
      pausedAt: at,
    };
  }
  if (s.status === "RUNNING") return s;
  return { ...s, status: "RUNNING", lastResumedAt: at, pausedAt: null };
}

/**
 * Sends queued ops in order, one at a time (AC-2). Success removes the op; a conflict drops it and
 * replay continues (AC-5); a network failure stops and keeps the rest; an unexpected server error
 * keeps the op for a later attempt, dropping it after 3 tries. Persists the queue after every step.
 */
export async function replay(
  userId: string,
  send: (op: QueuedOp) => Promise<SendResult>,
): Promise<ReplayOutcome> {
  const out: ReplayOutcome = { conflicts: [], offline: false };
  // Read the queue fresh each step: clicks during a replay append to its tail.
  for (let op = loadQueue(userId)[0]; op; op = loadQueue(userId)[0]) {
    const res = await send(op);
    const [, ...rest] = loadQueue(userId);
    if (res.kind === "network") {
      // From now on it is a past action: later sends must carry its time.
      saveQueue(userId, [{ ...op, live: false }, ...rest]);
      out.offline = true;
      break;
    }
    if (res.kind === "error") {
      const tries = (op.tries ?? 0) + 1;
      if (tries < MAX_TRIES) {
        saveQueue(userId, [{ ...op, tries, live: false }, ...rest]);
        break;
      }
      out.conflicts.push("FAILED");
    } else if (res.kind === "conflict") {
      out.conflicts.push(res.code);
    } else {
      out.session = res.session;
    }
    saveQueue(userId, rest);
  }
  return out;
}

/** A failed fetch (no response) rejects with a TypeError; a server error arrives as a plain Error. */
export function isNetworkError(e: unknown) {
  return (typeof navigator !== "undefined" && navigator.onLine === false) || e instanceof TypeError;
}

export const CONFLICT_TEXT: Record<Conflict["conflict"] | "FAILED", string> = {
  NO_SESSION: "This session was already finished or discarded on another device.",
  BAD_TIME: "An offline change had a time we couldn't trust, so it was skipped.",
  TOO_SHORT: "That session was under a minute, so it wasn't saved.",
  FAILED: "An offline change couldn't be saved.",
};
