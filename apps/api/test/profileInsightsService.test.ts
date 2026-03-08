import { describe, expect, it } from "vitest";
import { ProfileInsightsService } from "../src/services/profileInsightsService.js";

describe("profile insights service", () => {
  const service = new ProfileInsightsService();

  it("computes weekly insight cards", () => {
    const result = service.buildWeeklyInsights({
      timezone: "UTC",
      habits: [{ habit_id: "h1", required: "true" }],
      completions: [{ habit_id: "h1", completed: "true", local_date: "2026-03-02" }],
      runs: [
        { local_date: "2026-03-02", distance_km: "3.2" },
        { local_date: "2026-03-03", distance_km: "2.0" }
      ],
      weights: [
        { local_date: "2026-02-24", weight_kg: "80" },
        { local_date: "2026-03-03", weight_kg: "79.2" }
      ],
      goals: [{ type: "deficit", target_weight_kg: "72" }]
    });

    expect(result.consistencyPercent).toBeGreaterThanOrEqual(0);
    expect(result.adherencePercent).toBeGreaterThanOrEqual(0);
    expect(result.improvementPercent).toBeGreaterThanOrEqual(0);
    expect(result.goalType).toBe("deficit");
  });

  it("computes predictive coaching output", () => {
    const result = service.buildCoachInsights({
      timezone: "UTC",
      runs: [
        { local_date: "2026-03-01", distance_km: "2" },
        { local_date: "2026-03-05", distance_km: "4" }
      ],
      weights: [
        { local_date: "2026-02-20", weight_kg: "82" },
        { local_date: "2026-02-27", weight_kg: "81" },
        { local_date: "2026-03-06", weight_kg: "80.2" }
      ],
      goals: [{ type: "deficit", target_weight_kg: "75" }]
    });

    expect(result.latestWeightKg).toBeCloseTo(80.2, 1);
    expect(result.predictedWeight4WeeksKg).toBeGreaterThan(0);
    expect(result.coachingTips.length).toBeGreaterThan(0);
    expect(result.confidencePercent).toBeGreaterThanOrEqual(25);
  });
});
