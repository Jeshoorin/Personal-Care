export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export interface UserAppSettings {
  weeklyCheckinDay: Weekday;
  strictWeeklyCheckin: boolean;
}

export interface WeeklyCheckinValidation {
  allowed: boolean;
  reason?: string;
  nextAllowedDate?: string;
  checkinDay: Weekday;
}

const WEEKDAY_ORDER: Weekday[] = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];

export const DEFAULT_APP_SETTINGS: UserAppSettings = {
  weeklyCheckinDay: "monday",
  strictWeeklyCheckin: true
};

function normalizeWeekday(value: string | undefined): Weekday | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return WEEKDAY_ORDER.includes(normalized as Weekday)
    ? (normalized as Weekday)
    : null;
}

function parseDateOnly(value: string | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
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

function getWeekday(date: Date): Weekday {
  return WEEKDAY_ORDER[date.getUTCDay()];
}

function startOfIsoWeek(date: Date): Date {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = (copy.getUTCDay() + 6) % 7;
  copy.setUTCDate(copy.getUTCDate() - day);
  return copy;
}

function nextDateForWeekday(localDate: string, target: Weekday): string {
  const base = parseDateOnly(localDate);
  if (!base) return localDate;
  const currentDay = base.getUTCDay();
  const targetDay = WEEKDAY_ORDER.indexOf(target);
  const diff = (targetDay - currentDay + 7) % 7 || 7;
  return formatDateOnly(addDays(base, diff));
}

function latestMetricDate(metrics: Record<string, string>[]): Date | null {
  let latest: Date | null = null;
  for (const row of metrics) {
    const current = parseDateOnly(row.local_date);
    if (!current) continue;
    if (!latest || current > latest) {
      latest = current;
    }
  }
  return latest;
}

export function parseUserSettings(settingsJson: string | undefined): UserAppSettings {
  if (!settingsJson) return DEFAULT_APP_SETTINGS;
  try {
    const parsed = JSON.parse(settingsJson) as Partial<UserAppSettings>;
    const weeklyCheckinDay =
      normalizeWeekday(parsed.weeklyCheckinDay) ?? DEFAULT_APP_SETTINGS.weeklyCheckinDay;
    const strictWeeklyCheckin =
      typeof parsed.strictWeeklyCheckin === "boolean"
        ? parsed.strictWeeklyCheckin
        : DEFAULT_APP_SETTINGS.strictWeeklyCheckin;
    return {
      weeklyCheckinDay,
      strictWeeklyCheckin
    };
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function serializeUserSettings(settings: UserAppSettings): string {
  return JSON.stringify(settings);
}

export function validateWeeklyCheckin(
  localDate: string,
  metrics: Record<string, string>[],
  settings: UserAppSettings
): WeeklyCheckinValidation {
  const current = parseDateOnly(localDate);
  if (!current) {
    return {
      allowed: false,
      reason: "Invalid local date for check-in.",
      checkinDay: settings.weeklyCheckinDay
    };
  }

  const latest = latestMetricDate(metrics);
  if (!latest) {
    if (settings.strictWeeklyCheckin && getWeekday(current) !== settings.weeklyCheckinDay) {
      return {
        allowed: false,
        reason: `Weekly check-in is locked to ${settings.weeklyCheckinDay}.`,
        nextAllowedDate: nextDateForWeekday(localDate, settings.weeklyCheckinDay),
        checkinDay: settings.weeklyCheckinDay
      };
    }
    return { allowed: true, checkinDay: settings.weeklyCheckinDay };
  }

  if (settings.strictWeeklyCheckin) {
    const todayWeekday = getWeekday(current);
    if (todayWeekday !== settings.weeklyCheckinDay) {
      return {
        allowed: false,
        reason: `Weekly check-in is locked to ${settings.weeklyCheckinDay}.`,
        nextAllowedDate: nextDateForWeekday(localDate, settings.weeklyCheckinDay),
        checkinDay: settings.weeklyCheckinDay
      };
    }

    const currentWeekStart = startOfIsoWeek(current);
    const lastWeekStart = startOfIsoWeek(latest);
    if (currentWeekStart.getTime() === lastWeekStart.getTime()) {
      return {
        allowed: false,
        reason: "Weekly check-in already completed for this week.",
        nextAllowedDate: formatDateOnly(addDays(current, 7)),
        checkinDay: settings.weeklyCheckinDay
      };
    }
    return { allowed: true, checkinDay: settings.weeklyCheckinDay };
  }

  const dayDiff = Math.floor((current.getTime() - latest.getTime()) / (24 * 60 * 60 * 1000));
  if (dayDiff < 6) {
    return {
      allowed: false,
      reason: "Check-in allowed once every 7 days in flexible mode.",
      nextAllowedDate: formatDateOnly(addDays(latest, 7)),
      checkinDay: settings.weeklyCheckinDay
    };
  }
  return { allowed: true, checkinDay: settings.weeklyCheckinDay };
}
