import { describe, expect, it } from "vitest";
import { updateStreak } from "@personal-care/shared-types";

describe("strict streak behavior", () => {
  it("resets streak when required goals are not met", () => {
    const streak = updateStreak(
      { current: 9, longest: 15, lastDate: "2026-03-06" },
      "2026-03-07",
      false
    );
    expect(streak.current).toBe(0);
    expect(streak.longest).toBe(15);
  });
});
