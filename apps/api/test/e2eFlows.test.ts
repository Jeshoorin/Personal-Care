import cookieParser from "cookie-parser";
import express from "express";
import type { Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSessionToken } from "../src/middleware/auth.js";
import { createHabitRoutes } from "../src/routes/habitRoutes.js";
import { createProfileRoutes } from "../src/routes/profileRoutes.js";
import { MemoryStore } from "../src/store/memoryStore.js";

const WEEKDAY_ORDER = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
] as const;

class InMemorySheetsAdapter {
  private readonly rows = new Map<string, Record<string, string>[]>();

  private key(userId: string, tab: string): string {
    return `${userId}:${tab}`;
  }

  async listRows(user: { userId: string }, tab: string): Promise<Record<string, string>[]> {
    return [...(this.rows.get(this.key(user.userId, tab)) ?? [])];
  }

  async appendRow(
    user: { userId: string },
    tab: string,
    record: Record<string, string | number | boolean | undefined>
  ): Promise<void> {
    const now = new Date().toISOString();
    const row: Record<string, string> = {
      entry_id: String(record.entry_id ?? `${tab}-${Date.now()}-${Math.random()}`),
      user_id: user.userId,
      local_date: String(record.local_date ?? now.slice(0, 10)),
      created_at: now,
      updated_at: now
    };
    for (const [key, value] of Object.entries(record)) {
      if (value !== undefined) {
        row[key] = String(value);
      }
    }
    const key = this.key(user.userId, tab);
    const existing = this.rows.get(key) ?? [];
    existing.push(row);
    this.rows.set(key, existing);
  }
}

describe("e2e api flows", () => {
  const metadataStore = new MemoryStore();
  const sheets = new InMemorySheetsAdapter();
  const gamification = {
    async recordScoreEvent() {},
    async getScoreboard() {
      return { points: 120, level: 1, totalEvents: 3 };
    },
    async getStreakState() {
      return { current: 2, longest: 4 };
    }
  };

  const app = express();
  let baseUrl = "";
  let authCookie = "";
  let server: Server | null = null;

  function weekdayForIso(dateIso: string) {
    const date = new Date(`${dateIso}T00:00:00.000Z`);
    return WEEKDAY_ORDER[date.getUTCDay()];
  }

  async function requestJson(path: string, init?: RequestInit) {
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        cookie: authCookie,
        ...(init?.headers ?? {})
      }
    });
    const text = await response.text();
    const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    return { response, body };
  }

  beforeAll(async () => {
    await metadataStore.init();
    const user = await metadataStore.upsertUser({
      userId: "e2e-user",
      googleSub: "e2e-user",
      email: "e2e@example.com",
      name: "E2E User",
      encryptedRefreshToken: "encrypted-token",
      timezone: "UTC"
    });
    authCookie = `pc_session=${createSessionToken(user.userId)}`;

    app.use(express.json());
    app.use(cookieParser());
    app.locals.metadataStore = metadataStore;
    app.use("/", createHabitRoutes(sheets, gamification));
    app.use("/profile", createProfileRoutes(metadataStore, sheets, gamification));

    server = app.listen(0);
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    if (!server) return;
    await new Promise<void>((resolve) => server?.close(() => resolve()));
  });

  it("enforces strict weekly check-in day and returns coach insights", async () => {
    const todayIso = new Intl.DateTimeFormat("en-CA", {
      timeZone: "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date());
    const todayWeekday = weekdayForIso(todayIso);
    const differentDay = WEEKDAY_ORDER[(WEEKDAY_ORDER.indexOf(todayWeekday) + 1) % 7];

    const saveSettings = await requestJson("/profile/settings", {
      method: "POST",
      body: JSON.stringify({
        weeklyCheckinDay: differentDay,
        strictWeeklyCheckin: true
      })
    });
    expect(saveSettings.response.status).toBe(200);

    const blockedMetric = await requestJson("/metrics/body", {
      method: "POST",
      body: JSON.stringify({ weightKg: 80, waistCm: 90 })
    });
    expect(blockedMetric.response.status).toBe(409);
    expect(String(blockedMetric.body.error)).toContain("locked");

    const allowSettings = await requestJson("/profile/settings", {
      method: "POST",
      body: JSON.stringify({
        weeklyCheckinDay: todayWeekday,
        strictWeeklyCheckin: true
      })
    });
    expect(allowSettings.response.status).toBe(200);

    const allowedMetric = await requestJson("/metrics/body", {
      method: "POST",
      body: JSON.stringify({ weightKg: 79.5, waistCm: 89 })
    });
    expect(allowedMetric.response.status).toBe(201);

    const user = await metadataStore.getUserByUserId("e2e-user");
    if (!user) throw new Error("Missing user for e2e test setup.");
    await sheets.appendRow(user, "WeightLog", { local_date: "2026-02-20", weight_kg: 82 });
    await sheets.appendRow(user, "WeightLog", { local_date: "2026-03-01", weight_kg: 80.8 });
    await sheets.appendRow(user, "WeightLog", { local_date: "2026-03-07", weight_kg: 79.8 });
    await sheets.appendRow(user, "RunLog", { local_date: "2026-03-02", distance_km: 4.1 });
    await sheets.appendRow(user, "RunLog", { local_date: "2026-03-06", distance_km: 5.2 });
    await sheets.appendRow(user, "Goals", {
      local_date: "2026-03-01",
      type: "deficit",
      target_weight_kg: 74
    });

    const coach = await requestJson("/profile/coach-insights", { method: "GET" });
    expect(coach.response.status).toBe(200);
    expect(Array.isArray(coach.body.coachingTips)).toBe(true);
    expect((coach.body.coachingTips as unknown[]).length).toBeGreaterThan(0);
  });
});
