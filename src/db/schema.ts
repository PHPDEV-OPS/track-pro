import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createId } from "@/lib/id";
import { AMBIENT_SOUNDS } from "@/lib/sounds";

export const clockStyle = pgEnum("clock_style", ["DIGITAL", "WALL_CLOCK"]);
export const sessionStatus = pgEnum("session_status", ["RUNNING", "PAUSED"]);
export const ambientSound = pgEnum("ambient_sound", AMBIENT_SOUNDS);

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

export const activeSessions = pgTable("active_sessions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  status: sessionStatus("status").notNull(),
  targetSec: integer("target_sec").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  accumulatedSec: integer("accumulated_sec").notNull().default(0),
  lastResumedAt: timestamp("last_resumed_at", { withTimezone: true }),
});

export type TimeEntry = typeof timeEntries.$inferSelect;
export type ActiveSession = typeof activeSessions.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
