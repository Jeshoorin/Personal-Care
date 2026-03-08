import type { DailyEnergySummary } from "@personal-care/shared-types";

export type TabKey = "dashboard" | "diet" | "exercise" | "routine" | "profile";

export interface MeResponse {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  spreadsheetId: string | null;
}

export interface Scoreboard {
  points: number;
  level: number;
  totalEvents: number;
  adherencePercent: number;
}

export interface StreakData {
  current: number;
  longest: number;
}

export interface WeeklyInsights {
  weekStart: string;
  weekEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  daysElapsed: number;
  consistencyPercent: number;
  adherencePercent: number;
  improvementPercent: number;
  thisPeriodDistanceKm: number;
  previousPeriodDistanceKm: number;
  weightChangeKg: number;
  goalType: "deficit" | "surplus" | "maintenance";
}

export interface CoachInsights {
  goalType: "deficit" | "surplus" | "maintenance";
  latestWeightKg: number;
  targetWeightKg: number;
  weeklyWeightTrendKg: number;
  predictedWeight4WeeksKg: number;
  estimatedTargetDate: string | null;
  confidencePercent: number;
  thisPeriodDistanceKm: number;
  previousPeriodDistanceKm: number;
  coachingTips: string[];
}

export interface UserSettings {
  weeklyCheckinDay:
    | "monday"
    | "tuesday"
    | "wednesday"
    | "thursday"
    | "friday"
    | "saturday"
    | "sunday";
  strictWeeklyCheckin: boolean;
}

export interface DietSummaryResponse extends DailyEnergySummary {
  tdee: number;
  safetyWarnings: string[];
}

export type GenericRow = Record<string, string>;

export interface GpsPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

export interface FoodFormState {
  name: string;
  calories: string;
}

export interface GoalFormState {
  mode: "weekly_rate" | "target_date";
  type: "deficit" | "surplus" | "maintenance";
  currentWeightKg: string;
  targetWeightKg: string;
  targetDate: string;
  weeklyRateKg: string;
  activityMultiplier: string;
  age: string;
  sex: "male" | "female";
  heightCm: string;
}

export interface RunFormState {
  distanceKm: string;
  durationSec: string;
  notes: string;
}

export interface LapFormState {
  runId: string;
  lapNumber: string;
  lapDistanceKm: string;
  lapDurationSec: string;
}

export interface WorkoutFormState {
  title: string;
  level: "beginner" | "intermediate" | "advanced";
  focus: "fat_loss" | "strength" | "mobility";
  weekIndex: string;
  targetSessions: string;
}

export interface HabitFormState {
  title: string;
  reminderTime: string;
  required: boolean;
}

export interface ReminderFormState {
  title: string;
  time: string;
}

export interface MetricFormState {
  weightKg: string;
  waistCm: string;
  chestCm: string;
  hipCm: string;
  thighCm: string;
  armCm: string;
}

export interface MetricTrendRow {
  key: string;
  label: string;
  currentText: string;
  deltaText: string;
  target: string;
  statusLabel: string;
  statusClass: string;
}
