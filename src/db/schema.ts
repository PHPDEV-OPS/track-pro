import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, smallint, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";
import { STORED_SOUNDS } from "@/lib/sounds";

export const clockStyle = pgEnum("clock_style", ["DIGITAL", "WALL_CLOCK"]);
export const sessionStatus = pgEnum("session_status", ["RUNNING", "PAUSED"]);
export const ambientSound = pgEnum("ambient_sound", STORED_SOUNDS);
export const musicProvider = pgEnum("music_provider", ["YOUTUBE", "SPOTIFY"]);
export const musicKind = pgEnum("music_kind", ["PLAYLIST", "VIDEO", "ALBUM", "TRACK"]);

export const users = pgTable("users", {
  id: text("id").primaryKey(), // Clerk user id
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userSettings = pgTable(
  "user_settings",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    clockStyle: clockStyle("clock_style").notNull().default("DIGITAL"),
    theme: text("theme").notNull().default("system"),
    timezone: text("timezone").notNull().default("UTC"),
    ambientSound: ambientSound("ambient_sound").notNull().default("OFF"),
    ambientVolume: integer("ambient_volume").notNull().default(50),
    // Set when ambient_sound = MUSIC; MUSIC with no link reads as Off (spec 0005).
    musicLinkId: text("music_link_id").references(() => musicLinks.id, { onDelete: "set null" }),
  },
  (t) => [check("ambient_volume_range", sql`${t.ambientVolume} between 0 and 100`)],
);

export const timeEntries = pgTable(
  "time_entries",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    durationSec: integer("duration_sec").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    imageUrl: text("image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("time_entries_user_started_idx").on(t.userId, t.startedAt)],
);

export const activeSessions = pgTable(
  "active_sessions",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    status: sessionStatus("status").notNull(),
    targetSec: integer("target_sec").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    accumulatedSec: integer("accumulated_sec").notNull().default(0),
    lastResumedAt: timestamp("last_resumed_at", { withTimezone: true }),
    pausedAt: timestamp("paused_at", { withTimezone: true }),
  },
  // paused_at is set exactly while PAUSED (spec 0003).
  (t) => [check("paused_at_matches_status", sql`(${t.status} = 'PAUSED') = (${t.pausedAt} is not null)`)],
);

/** Up to 5 saved YouTube or Spotify links per user, one per slot (spec 0005). */
export const musicLinks = pgTable(
  "music_links",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    slot: smallint("slot").notNull(),
    provider: musicProvider("provider").notNull(),
    kind: musicKind("kind").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("music_links_slot_range", sql`${t.slot} between 1 and 5`),
    check("music_links_title_length", sql`char_length(${t.title}) between 1 and 200`),
    unique("music_links_user_slot").on(t.userId, t.slot),
    unique("music_links_user_link").on(t.userId, t.provider, t.kind, t.externalId),
  ],
);

export type MusicLink = typeof musicLinks.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type ActiveSession = typeof activeSessions.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
