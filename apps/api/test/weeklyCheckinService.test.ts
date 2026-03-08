import { describe, expect, it } from "vitest";
import {
  parseUserSettings,
  validateWeeklyCheckin
} from "../src/services/weeklyCheckinService.js";

describe("weekly check-in settings", () => {
  it("falls back to strict monday settings by default", () => {
    const settings = parseUserSettings(undefined);
    expect(settings.weeklyCheckinDay).toBe("monday");
    expect(settings.strictWeeklyCheckin).toBe(true);
  });

  it("blocks strict check-in when attempted on the wrong weekday", () => {
    const settings = {
      weeklyCheckinDay: "monday" as const,
      strictWeeklyCheckin: true
    };
    const result = validateWeeklyCheckin("2026-03-10", [], settings); // Tuesday
    expect(result.allowed).toBe(false);
    expect(result.nextAllowedDate).toBe("2026-03-16");
  });

  it("blocks a second strict check-in within the same week", () => {
    const settings = {
      weeklyCheckinDay: "monday" as const,
      strictWeeklyCheckin: true
    };
    const rows = [{ local_date: "2026-03-09" }];
    const result = validateWeeklyCheckin("2026-03-09", rows, settings);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("already completed");
  });

  it("allows flexible mode only after 7-day spacing", () => {
    const settings = {
      weeklyCheckinDay: "monday" as const,
      strictWeeklyCheckin: false
    };
    const blocked = validateWeeklyCheckin("2026-03-10", [{ local_date: "2026-03-06" }], settings);
    expect(blocked.allowed).toBe(false);
    const allowed = validateWeeklyCheckin("2026-03-13", [{ local_date: "2026-03-06" }], settings);
    expect(allowed.allowed).toBe(true);
  });
});
