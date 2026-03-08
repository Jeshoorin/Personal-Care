import { localDateInTimeZone } from "../lib/date.js";

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseDateOnly(date: string | undefined): Date | null {
  if (!date) return null;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00.000Z` : date;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfIsoWeek(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day);
  return d;
}

function isWithinRange(localDate: string | undefined, start: Date, end: Date): boolean {
  const parsed = parseDateOnly(localDate);
  return parsed !== null && parsed >= start && parsed <= end;
}

function toFiniteNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export interface WeeklyInsightsInput {
  timezone: string;
  habits: Record<string, string>[];
  completions: Record<string, string>[];
  runs: Record<string, string>[];
  weights: Record<string, string>[];
  goals: Record<string, string>[];
}

export interface CoachInsightsInput {
  timezone: string;
  runs: Record<string, string>[];
  weights: Record<string, string>[];
  goals: Record<string, string>[];
}

function regressionSlopeByDay(
  points: Array<{ dayOffset: number; value: number }>
): number {
  if (points.length < 2) return 0;
  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.dayOffset, 0);
  const sumY = points.reduce((sum, p) => sum + p.value, 0);
  const sumXY = points.reduce((sum, p) => sum + p.dayOffset * p.value, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.dayOffset * p.dayOffset, 0);
  const numerator = n * sumXY - sumX * sumY;
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  return numerator / denominator;
}

function buildCoachingTips(params: {
  goalType: string;
  weeklyTrendKg: number;
  runDistanceCurrentKm: number;
  runDistancePreviousKm: number;
}): string[] {
  const tips: string[] = [];
  if (params.goalType === "deficit") {
    if (params.weeklyTrendKg >= -0.2) {
      tips.push("Deficit progress is slow. Tighten daily calorie adherence by 100-150 kcal.");
    } else if (params.weeklyTrendKg < -1) {
      tips.push("Weight is dropping too fast. Increase intake slightly to protect recovery.");
    } else {
      tips.push("Weight-loss pace is in a healthy range. Keep current plan steady.");
    }
  } else if (params.goalType === "surplus") {
    if (params.weeklyTrendKg <= 0.1) {
      tips.push("Surplus progress is slow. Add one calorie-dense meal/snack daily.");
    } else if (params.weeklyTrendKg > 0.8) {
      tips.push("Weight gain is too fast. Reduce surplus to avoid unnecessary fat gain.");
    } else {
      tips.push("Surplus pace looks solid. Keep strength progression consistent.");
    }
  } else {
    if (Math.abs(params.weeklyTrendKg) > 0.4) {
      tips.push("Maintenance drift detected. Align intake with TDEE and monitor sleep consistency.");
    } else {
      tips.push("Weight maintenance is stable. Continue current routine and hydration.");
    }
  }

  if (params.runDistanceCurrentKm < params.runDistancePreviousKm) {
    tips.push("Running volume dropped versus previous period. Schedule 2 fixed run slots this week.");
  } else if (params.runDistanceCurrentKm > 0) {
    tips.push("Running consistency improved. Keep one easy and one quality session weekly.");
  }

  if (tips.length === 0) {
    tips.push("Log meals, workouts, and weight consistently for stronger coaching signals.");
  }
  return tips;
}

export class ProfileInsightsService {
  buildWeeklyInsights({
    timezone,
    habits,
    completions,
    runs,
    weights,
    goals
  }: WeeklyInsightsInput) {
    const today = parseDateOnly(localDateInTimeZone(timezone)) ?? new Date();
    const periodStart = startOfIsoWeek(today);
    const daysElapsed = Math.max(
      1,
      Math.floor((today.getTime() - periodStart.getTime()) / (24 * 60 * 60 * 1000)) + 1
    );
    const periodEnd = addDays(periodStart, daysElapsed - 1);
    const previousPeriodStart = addDays(periodStart, -daysElapsed);
    const previousPeriodEnd = addDays(periodStart, -1);

    const requiredHabitIds = new Set(
      habits
        .filter((habit) => habit.required === "true" && habit.habit_id)
        .map((habit) => habit.habit_id)
    );

    const completedRequiredSet = new Set<string>();
    const completedByDate = new Map<string, Set<string>>();
    for (const row of completions) {
      const habitId = row.habit_id;
      if (row.completed !== "true" || !habitId || !requiredHabitIds.has(habitId)) continue;
      if (!isWithinRange(row.local_date, periodStart, periodEnd)) continue;
      completedRequiredSet.add(`${row.local_date}:${habitId}`);

      const dayKey = row.local_date;
      const existing = completedByDate.get(dayKey) ?? new Set<string>();
      existing.add(habitId);
      completedByDate.set(dayKey, existing);
    }

    const expectedRequired = requiredHabitIds.size * daysElapsed;
    const adherencePercent = expectedRequired
      ? clamp(Math.round((completedRequiredSet.size / expectedRequired) * 100), 0, 100)
      : 0;

    let perfectDays = 0;
    if (requiredHabitIds.size > 0) {
      for (let i = 0; i < daysElapsed; i += 1) {
        const dayKey = formatDateOnly(addDays(periodStart, i));
        const completedSet = completedByDate.get(dayKey) ?? new Set<string>();
        const dayComplete = Array.from(requiredHabitIds).every((habitId) =>
          completedSet.has(habitId)
        );
        if (dayComplete) {
          perfectDays += 1;
        }
      }
    }
    const consistencyPercent =
      requiredHabitIds.size > 0 ? Math.round((perfectDays / daysElapsed) * 100) : 0;

    const thisPeriodDistance = runs
      .filter((row) => isWithinRange(row.local_date, periodStart, periodEnd))
      .reduce((sum, row) => sum + (toFiniteNumber(row.distance_km) ?? 0), 0);
    const previousPeriodDistance = runs
      .filter((row) => isWithinRange(row.local_date, previousPeriodStart, previousPeriodEnd))
      .reduce((sum, row) => sum + (toFiniteNumber(row.distance_km) ?? 0), 0);

    const runRatio =
      previousPeriodDistance > 0
        ? (thisPeriodDistance - previousPeriodDistance) / previousPeriodDistance
        : thisPeriodDistance > 0
          ? 1
          : 0;
    const runScore = clamp(Math.round(50 + runRatio * 50), 0, 100);

    const sortedWeights = [...weights].sort((a, b) => {
      const aTime = parseDateOnly(a.local_date)?.getTime() ?? 0;
      const bTime = parseDateOnly(b.local_date)?.getTime() ?? 0;
      return aTime - bTime;
    });

    const currentWeight = [...sortedWeights]
      .reverse()
      .find((row) => isWithinRange(row.local_date, periodStart, periodEnd));
    const previousWeight = [...sortedWeights]
      .reverse()
      .find((row) => isWithinRange(row.local_date, previousPeriodStart, previousPeriodEnd));

    const currentWeightKg = toFiniteNumber(currentWeight?.weight_kg);
    const previousWeightKg = toFiniteNumber(previousWeight?.weight_kg);
    const weightChangeKg =
      currentWeightKg !== undefined && previousWeightKg !== undefined
        ? Number((previousWeightKg - currentWeightKg).toFixed(2))
        : 0;

    const latestGoalType = [...goals].reverse().find((row) => row.type)?.type ?? "maintenance";

    let weightScore = 50;
    if (currentWeightKg !== undefined && previousWeightKg !== undefined) {
      if (latestGoalType === "deficit") {
        if (weightChangeKg >= 0.2 && weightChangeKg <= 1) {
          weightScore = 85;
        } else if (weightChangeKg > 0) {
          weightScore = 65;
        } else {
          weightScore = 25;
        }
      } else if (latestGoalType === "surplus") {
        const gain = -weightChangeKg;
        if (gain >= 0.1 && gain <= 0.8) {
          weightScore = 85;
        } else if (gain > 0) {
          weightScore = 65;
        } else {
          weightScore = 25;
        }
      } else {
        const drift = Math.abs(weightChangeKg);
        if (drift <= 0.3) {
          weightScore = 85;
        } else if (drift <= 0.6) {
          weightScore = 60;
        } else {
          weightScore = 25;
        }
      }
    }

    const improvementPercent = clamp(Math.round((runScore + weightScore) / 2), 0, 100);

    return {
      weekStart: formatDateOnly(periodStart),
      weekEnd: formatDateOnly(periodEnd),
      previousPeriodStart: formatDateOnly(previousPeriodStart),
      previousPeriodEnd: formatDateOnly(previousPeriodEnd),
      daysElapsed,
      consistencyPercent,
      adherencePercent,
      improvementPercent,
      thisPeriodDistanceKm: Number(thisPeriodDistance.toFixed(2)),
      previousPeriodDistanceKm: Number(previousPeriodDistance.toFixed(2)),
      weightChangeKg,
      goalType: latestGoalType
    };
  }

  buildCoachInsights({ timezone, runs, weights, goals }: CoachInsightsInput) {
    const today = parseDateOnly(localDateInTimeZone(timezone)) ?? new Date();
    const periodStart = addDays(today, -13);
    const previousPeriodStart = addDays(periodStart, -14);
    const previousPeriodEnd = addDays(periodStart, -1);

    const thisPeriodDistance = runs
      .filter((row) => isWithinRange(row.local_date, periodStart, today))
      .reduce((sum, row) => sum + (toFiniteNumber(row.distance_km) ?? 0), 0);
    const previousPeriodDistance = runs
      .filter((row) => isWithinRange(row.local_date, previousPeriodStart, previousPeriodEnd))
      .reduce((sum, row) => sum + (toFiniteNumber(row.distance_km) ?? 0), 0);

    const sortedWeights = [...weights]
      .map((row) => ({
        date: parseDateOnly(row.local_date),
        value: toFiniteNumber(row.weight_kg)
      }))
      .filter((item): item is { date: Date; value: number } => Boolean(item.date) && item.value !== undefined)
      .sort((a, b) => a.date.getTime() - b.date.getTime());

    const latestWeightKg = sortedWeights[sortedWeights.length - 1]?.value ?? 0;
    const latestGoal = [...goals].reverse()[0];
    const goalType =
      latestGoal?.type === "deficit" || latestGoal?.type === "surplus" || latestGoal?.type === "maintenance"
        ? latestGoal.type
        : "maintenance";
    const targetWeightKg = toFiniteNumber(latestGoal?.target_weight_kg) ?? latestWeightKg;

    let weeklyWeightTrendKg = 0;
    let predictedWeight4WeeksKg = latestWeightKg;
    let estimatedTargetDate: string | null = null;

    if (sortedWeights.length >= 2) {
      const baseline = sortedWeights[0].date;
      const regressionInput = sortedWeights.slice(-8).map((item) => ({
        dayOffset: Math.round((item.date.getTime() - baseline.getTime()) / (24 * 60 * 60 * 1000)),
        value: item.value
      }));
      const slopeKgPerDay = regressionSlopeByDay(regressionInput);
      weeklyWeightTrendKg = Number((slopeKgPerDay * 7).toFixed(2));
      predictedWeight4WeeksKg = Number((latestWeightKg + slopeKgPerDay * 28).toFixed(2));

      if (Math.abs(slopeKgPerDay) > 0.0001) {
        const daysToTarget = Math.round((targetWeightKg - latestWeightKg) / slopeKgPerDay);
        if (daysToTarget > 0 && Number.isFinite(daysToTarget)) {
          estimatedTargetDate = formatDateOnly(addDays(today, daysToTarget));
        }
      }
    }

    const confidencePercent = clamp(
      Math.round(Math.min(100, sortedWeights.length * 10 + (thisPeriodDistance > 0 ? 20 : 0))),
      25,
      100
    );

    const coachingTips = buildCoachingTips({
      goalType,
      weeklyTrendKg: weeklyWeightTrendKg,
      runDistanceCurrentKm: thisPeriodDistance,
      runDistancePreviousKm: previousPeriodDistance
    });

    return {
      goalType,
      latestWeightKg: Number(latestWeightKg.toFixed(2)),
      targetWeightKg: Number(targetWeightKg.toFixed(2)),
      weeklyWeightTrendKg,
      predictedWeight4WeeksKg,
      estimatedTargetDate,
      confidencePercent,
      thisPeriodDistanceKm: Number(thisPeriodDistance.toFixed(2)),
      previousPeriodDistanceKm: Number(previousPeriodDistance.toFixed(2)),
      coachingTips
    };
  }
}
