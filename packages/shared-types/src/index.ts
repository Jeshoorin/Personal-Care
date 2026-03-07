export type GoalMode = "target_date" | "weekly_rate";
export type GoalType = "deficit" | "surplus" | "maintenance";

export interface GoalPlan {
  mode: GoalMode;
  type: GoalType;
  currentWeightKg: number;
  targetWeightKg: number;
  targetDate?: string;
  weeklyRateKg?: number;
  activityMultiplier: number;
}

export interface PersonMetrics {
  age: number;
  sex: "male" | "female";
  heightCm: number;
  weightKg: number;
}

export interface EnergyComputation {
  bmr: number;
  tdee: number;
  targetCalories: number;
  deltaCalories: number;
  safetyWarnings: string[];
}

export interface DailyEnergySummary {
  date: string;
  consumedCalories: number;
  targetCalories: number;
  waterTargetMl: number;
  waterConsumedMl: number;
  status: "on_track" | "slightly_off" | "off_track";
}

export interface RunSession {
  id: string;
  date: string;
  distanceKm: number;
  durationSec: number;
}

export interface LapSplit {
  id: string;
  runId: string;
  lapNumber: number;
  lapDistanceKm: number;
  lapDurationSec: number;
}

export interface WorkoutPlan {
  id: string;
  level: "beginner" | "intermediate" | "advanced";
  focus: "fat_loss" | "strength" | "mobility";
  weekIndex: number;
}

export interface HabitTask {
  id: string;
  title: string;
  required: boolean;
  reminderTime?: string;
}

export interface ScoreEvent {
  id: string;
  date: string;
  type:
    | "habit_completed"
    | "calorie_target_hit"
    | "water_target_hit"
    | "workout_completed"
    | "run_logged"
    | "weekly_metrics_logged";
}

export interface StreakState {
  current: number;
  longest: number;
  lastDate?: string;
}

export interface SyncOutboxItem {
  id: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ScoringConfig {
  habitCompleted: number;
  calorieTargetHit: number;
  waterTargetHit: number;
  workoutCompleted: number;
  runLogged: number;
  weeklyMetricsLogged: number;
  levelEveryPoints: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  habitCompleted: 10,
  calorieTargetHit: 20,
  waterTargetHit: 10,
  workoutCompleted: 30,
  runLogged: 30,
  weeklyMetricsLogged: 40,
  levelEveryPoints: 500
};

export const SHEET_TABS = [
  "Profile",
  "Goals",
  "FoodLog",
  "WaterLog",
  "WeightLog",
  "RunLog",
  "RunLaps",
  "WorkoutPlans",
  "WorkoutSessions",
  "BodyMetrics",
  "Habits",
  "HabitCompletions",
  "Reminders",
  "Scores",
  "Streaks",
  "Audit"
] as const;

export const BASE_RECORD_FIELDS = [
  "entry_id",
  "user_id",
  "local_date",
  "created_at",
  "updated_at"
] as const;

export function calculateBmr(metrics: PersonMetrics): number {
  const base =
    10 * metrics.weightKg + 6.25 * metrics.heightCm - 5 * metrics.age;
  return metrics.sex === "male" ? base + 5 : base - 161;
}

export function calculateTdee(
  metrics: PersonMetrics,
  activityMultiplier: number
): number {
  const bmr = calculateBmr(metrics);
  return bmr * activityMultiplier;
}

function calculateDeltaForPlan(plan: GoalPlan): number {
  if (plan.type === "maintenance") return 0;
  if (plan.mode === "weekly_rate") {
    const weeklyRate = plan.weeklyRateKg ?? 0;
    return (7700 * weeklyRate) / 7;
  }
  const targetDate = new Date(plan.targetDate ?? "");
  const now = new Date();
  const diffMs = targetDate.getTime() - now.getTime();
  const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  const kgDifference = Math.abs(plan.currentWeightKg - plan.targetWeightKg);
  return (7700 * kgDifference) / daysLeft;
}

export function computeEnergyPlan(
  metrics: PersonMetrics,
  plan: GoalPlan
): EnergyComputation {
  const bmr = calculateBmr(metrics);
  const tdee = calculateTdee(metrics, plan.activityMultiplier);
  const baseDelta = calculateDeltaForPlan(plan);
  const deltaCalories =
    plan.type === "deficit"
      ? -Math.abs(baseDelta)
      : plan.type === "surplus"
      ? Math.abs(baseDelta)
      : 0;
  const targetCalories = Math.round(tdee + deltaCalories);
  const safetyWarnings: string[] = [];

  if (Math.abs(deltaCalories) > 1000) {
    safetyWarnings.push("Daily calorie delta exceeds 1000 kcal.");
  }
  if (plan.mode === "weekly_rate" && (plan.weeklyRateKg ?? 0) > 1) {
    safetyWarnings.push("Weekly weight change is above 1 kg/week.");
  }
  if (targetCalories < 1200) {
    safetyWarnings.push("Target calories are below 1200 kcal.");
  }

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories,
    deltaCalories: Math.round(deltaCalories),
    safetyWarnings
  };
}

export function calculateWaterTargetMl(weightKg: number): number {
  return Math.round(weightKg * 35);
}

export function evaluateDailyStatus(
  consumedCalories: number,
  targetCalories: number
): DailyEnergySummary["status"] {
  const difference = Math.abs(consumedCalories - targetCalories);
  if (difference <= 100) return "on_track";
  if (difference <= 250) return "slightly_off";
  return "off_track";
}

export function scoreFromEvents(
  events: ScoreEvent[],
  config: ScoringConfig = DEFAULT_SCORING
): { points: number; level: number } {
  let points = 0;
  for (const event of events) {
    switch (event.type) {
      case "habit_completed":
        points += config.habitCompleted;
        break;
      case "calorie_target_hit":
        points += config.calorieTargetHit;
        break;
      case "water_target_hit":
        points += config.waterTargetHit;
        break;
      case "workout_completed":
        points += config.workoutCompleted;
        break;
      case "run_logged":
        points += config.runLogged;
        break;
      case "weekly_metrics_logged":
        points += config.weeklyMetricsLogged;
        break;
    }
  }
  return { points, level: Math.max(1, Math.floor(points / config.levelEveryPoints) + 1) };
}

export function updateStreak(
  state: StreakState,
  date: string,
  metRequiredGoals: boolean
): StreakState {
  if (!metRequiredGoals) {
    return {
      current: 0,
      longest: state.longest,
      lastDate: date
    };
  }

  const previousDate = state.lastDate ? new Date(state.lastDate) : undefined;
  const currentDate = new Date(date);

  let nextCurrent = 1;
  if (previousDate) {
    const dayDiff = Math.round(
      (currentDate.getTime() - previousDate.getTime()) /
        (24 * 60 * 60 * 1000)
    );
    if (dayDiff === 1) {
      nextCurrent = state.current + 1;
    } else if (dayDiff === 0) {
      nextCurrent = state.current;
    }
  }

  return {
    current: nextCurrent,
    longest: Math.max(state.longest, nextCurrent),
    lastDate: date
  };
}
