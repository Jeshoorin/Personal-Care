export function nowIso(): string {
  return new Date().toISOString();
}

export function localDateInTimeZone(timeZone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(now);
}

export function localTimeInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return formatter.format(new Date());
}

export function isReminderDue(reminderTime: string, localTime: string): boolean {
  return reminderTime.slice(0, 5) === localTime.slice(0, 5);
}
