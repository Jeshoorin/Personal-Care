import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import webPush from "web-push";
import { z } from "zod";
import { env } from "../config/env.js";
import { isReminderDue, localDateInTimeZone, localTimeInTimeZone } from "../lib/date.js";
import { requireAuth } from "../middleware/auth.js";
import { GamificationService } from "../services/gamificationService.js";
import { SheetsService } from "../services/sheetsService.js";
import type { MetadataStore } from "../store/metadataStore.js";

const reminderSchema = z.object({
  title: z.string().min(1),
  time: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  enabled: z.boolean().default(true),
  type: z.string().default("habit")
});

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string()
  })
});

function setupWebPush() {
  if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
    webPush.setVapidDetails(
      env.VAPID_SUBJECT,
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY
    );
  }
}

export function createReminderRoutes(
  metadataStore: MetadataStore,
  sheetsService: SheetsService,
  gamificationService: GamificationService
) {
  const router = Router();
  setupWebPush();

  router.get("/reminders", requireAuth, async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "Reminders");
    res.json(rows);
  });

  router.post("/reminders", requireAuth, async (req, res) => {
    const parsed = reminderSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "Reminders", {
      reminder_id: uuidv4(),
      title: parsed.data.title,
      time: parsed.data.time,
      enabled: parsed.data.enabled,
      type: parsed.data.type
    });
    res.status(201).json({ ok: true });
  });

  router.post("/push/subscribe", requireAuth, async (req, res) => {
    const parsed = pushSubscriptionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await metadataStore.savePushSubscription({
      userId: user.userId,
      endpoint: parsed.data.endpoint,
      subscriptionJson: JSON.stringify(parsed.data)
    });
    res.status(201).json({
      ok: true,
      vapidPublicKey: env.VAPID_PUBLIC_KEY ?? null
    });
  });

  router.post("/jobs/reminders/run", async (req, res) => {
    if (env.CRON_SECRET) {
      const token = req.header("x-cron-secret");
      if (token !== env.CRON_SECRET) {
        res.status(401).json({ error: "Invalid cron secret." });
        return;
      }
    }

    const users = await metadataStore.listUsers();
    let sent = 0;

    for (const user of users) {
      if (!user.spreadsheetId) continue;
      const localDate = localDateInTimeZone(user.timezone);
      const localTime = localTimeInTimeZone(user.timezone);
      const reminders = await sheetsService.listRows(user, "Reminders");
      const dueReminders = reminders.filter(
        (row) => row.enabled === "true" && isReminderDue(row.time, localTime)
      );
      if (dueReminders.length > 0) {
        const subscriptions = await metadataStore.listPushSubscriptions(user.userId);
        for (const sub of subscriptions) {
          try {
            await webPush.sendNotification(
              JSON.parse(sub.subscriptionJson),
              JSON.stringify({
                title: "Personal Care Reminder",
                body: dueReminders[0]?.title ?? "You have a scheduled reminder.",
                tag: "personal-care-reminder"
              })
            );
            sent += 1;
          } catch {
            await metadataStore.removePushSubscription(sub.endpoint);
          }
        }
      }

      if (localTime >= "23:55") {
        const habits = await sheetsService.listRows(user, "Habits");
        const required = habits.filter((habit) => habit.required === "true");
        const completions = await sheetsService.listRows(user, "HabitCompletions");
        const completedToday = completions.filter(
          (row) => row.local_date === localDate && row.completed === "true"
        );
        const completedSet = new Set(completedToday.map((item) => item.habit_id));
        const metRequiredGoals =
          required.length > 0 &&
          required.every((habit) => completedSet.has(habit.habit_id));
        await gamificationService.recordDailyStreak(user, metRequiredGoals);
      }
    }

    res.json({ ok: true, sent });
  });

  return router;
}
