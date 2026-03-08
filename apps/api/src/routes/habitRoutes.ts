import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { localDateInTimeZone } from "../lib/date.js";
import { requireAuth } from "../middleware/auth.js";
import { GamificationService } from "../services/gamificationService.js";
import { SheetsService } from "../services/sheetsService.js";
import {
  parseUserSettings,
  validateWeeklyCheckin
} from "../services/weeklyCheckinService.js";

type HabitSheetsPort = Pick<SheetsService, "listRows" | "appendRow">;
type HabitGamificationPort = Pick<GamificationService, "recordScoreEvent">;

const metricSchema = z.object({
  weightKg: z.coerce.number().positive(),
  waistCm: z.coerce.number().positive().optional(),
  chestCm: z.coerce.number().positive().optional(),
  hipCm: z.coerce.number().positive().optional(),
  thighCm: z.coerce.number().positive().optional(),
  armCm: z.coerce.number().positive().optional()
});

const habitSchema = z.object({
  title: z.string().min(1),
  required: z.boolean().default(true),
  reminderTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional(),
  category: z.string().default("personal")
});

const habitCompletionSchema = z.object({
  completed: z.boolean().default(true)
});

const STARTER_HABITS = [
  { title: "Brush teeth (AM)", reminderTime: "07:00", category: "hygiene" },
  { title: "Brush teeth (PM)", reminderTime: "21:30", category: "hygiene" },
  { title: "Take bath", reminderTime: "08:00", category: "hygiene" },
  { title: "Hydration check", reminderTime: "12:00", category: "health" },
  { title: "Stretch / mobility", reminderTime: "18:00", category: "fitness" },
  { title: "Sleep on time", reminderTime: "22:30", category: "recovery" }
] as const;

export function createHabitRoutes(
  sheetsService: HabitSheetsPort,
  gamificationService: HabitGamificationPort
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/metrics/body", async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "BodyMetrics");
    res.json(rows);
  });

  router.post("/metrics/body", async (req, res) => {
    const parsed = metricSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const localDate = localDateInTimeZone(user.timezone);
    const existingMetrics = await sheetsService.listRows(user, "BodyMetrics");
    const settings = parseUserSettings(user.settingsJson);
    const validation = validateWeeklyCheckin(localDate, existingMetrics, settings);
    if (!validation.allowed) {
      res.status(409).json({
        error: validation.reason ?? "Weekly check-in is not allowed today.",
        checkinDay: validation.checkinDay,
        nextAllowedDate: validation.nextAllowedDate ?? null,
        strictWeeklyCheckin: settings.strictWeeklyCheckin
      });
      return;
    }

    await sheetsService.appendRow(user, "BodyMetrics", {
      local_date: localDate,
      weight_kg: parsed.data.weightKg,
      waist_cm: parsed.data.waistCm ?? "",
      chest_cm: parsed.data.chestCm ?? "",
      hip_cm: parsed.data.hipCm ?? "",
      thigh_cm: parsed.data.thighCm ?? "",
      arm_cm: parsed.data.armCm ?? ""
    });
    await gamificationService.recordScoreEvent(user, "weekly_metrics_logged");
    res.status(201).json({ ok: true });
  });

  router.get("/habits", async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "Habits");
    if (rows.length === 0) {
      for (const habit of STARTER_HABITS) {
        await sheetsService.appendRow(user, "Habits", {
          habit_id: uuidv4(),
          title: habit.title,
          required: true,
          reminder_time: habit.reminderTime,
          category: habit.category
        });
      }
      const seeded = await sheetsService.listRows(user, "Habits");
      res.json(seeded);
      return;
    }
    res.json(rows);
  });

  router.post("/habits", async (req, res) => {
    const parsed = habitSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const habitId = uuidv4();
    await sheetsService.appendRow(user, "Habits", {
      habit_id: habitId,
      title: parsed.data.title,
      required: parsed.data.required,
      reminder_time: parsed.data.reminderTime ?? "",
      category: parsed.data.category
    });
    res.status(201).json({ habitId });
  });

  router.post("/habits/:id/check", async (req, res) => {
    const parsed = habitCompletionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "HabitCompletions", {
      habit_id: req.params.id,
      completed: parsed.data.completed,
      completed_at: new Date().toISOString()
    });
    if (parsed.data.completed) {
      await gamificationService.recordScoreEvent(user, "habit_completed");
    }
    res.status(201).json({ ok: true });
  });

  return router;
}
