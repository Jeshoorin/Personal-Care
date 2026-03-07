import { describe, expect, it } from "vitest";
import {
  calculateWaterTargetMl,
  computeEnergyPlan,
  scoreFromEvents,
  updateStreak
} from "../src/index";

describe("health calculations", () => {
  it("computes water target by weight", () => {
    expect(calculateWaterTargetMl(70)).toBe(2450);
  });

  it("computes deficit calorie target", () => {
    const output = computeEnergyPlan(
      {
        age: 30,
        sex: "male",
        heightCm: 175,
        weightKg: 80
      },
      {
        mode: "weekly_rate",
        type: "deficit",
        currentWeightKg: 80,
        targetWeightKg: 75,
        weeklyRateKg: 0.5,
        activityMultiplier: 1.4
      }
    );
    expect(output.targetCalories).toBeLessThan(output.tdee);
  });
});

describe("gamification", () => {
  it("sums score and computes level", () => {
    const result = scoreFromEvents([
      { id: "1", date: "2026-03-07", type: "habit_completed" },
      { id: "2", date: "2026-03-07", type: "workout_completed" },
      { id: "3", date: "2026-03-07", type: "run_logged" }
    ]);
    expect(result.points).toBe(70);
    expect(result.level).toBe(1);
  });

  it("hard resets streak on missed day", () => {
    const state = updateStreak(
      { current: 6, longest: 10, lastDate: "2026-03-06" },
      "2026-03-07",
      false
    );
    expect(state.current).toBe(0);
    expect(state.longest).toBe(10);
  });
});
