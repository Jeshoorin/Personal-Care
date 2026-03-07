import { Router } from "express";
import { localDateInTimeZone } from "../lib/date.js";
import { requireAuth } from "../middleware/auth.js";
import { GamificationService } from "../services/gamificationService.js";
import { SheetsService } from "../services/sheetsService.js";

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

export function createProfileRoutes(
  sheetsService: SheetsService,
  gamificationService: GamificationService
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/scoreboard", async (req, res) => {
    const user = req.user!;
    const [scoreboard, habits, completions] = await Promise.all([
      gamificationService.getScoreboard(user),
      sheetsService.listRows(user, "Habits"),
      sheetsService.listRows(user, "HabitCompletions")
    ]);
    const requiredHabits = habits.filter((habit) => habit.required === "true").length;
    const completedRequired = completions.filter((row) => row.completed === "true").length;
    const adherence = requiredHabits
      ? Math.min(100, Math.round((completedRequired / requiredHabits) * 100))
      : 0;

    res.json({
      ...scoreboard,
      adherencePercent: adherence
    });
  });

  router.get("/streaks", async (req, res) => {
    const user = req.user!;
    const streak = await gamificationService.getStreakState(user);
    res.json(streak);
  });

  router.get("/weekly-insights", async (req, res) => {
    const user = req.user!;
    const [habits, completions, runs, weights, goals] = await Promise.all([
      sheetsService.listRows(user, "Habits"),
      sheetsService.listRows(user, "HabitCompletions"),
      sheetsService.listRows(user, "RunLog"),
      sheetsService.listRows(user, "WeightLog"),
      sheetsService.listRows(user, "Goals")
    ]);

    const today = parseDateOnly(localDateInTimeZone(user.timezone)) ?? new Date();
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

    const latestGoalType =
      [...goals].reverse().find((row) => row.type)?.type ?? "maintenance";

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

    res.json({
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
    });
  });

  return router;
}
