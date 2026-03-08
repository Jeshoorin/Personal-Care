import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { GamificationService } from "../services/gamificationService.js";
import { ProfileInsightsService } from "../services/profileInsightsService.js";
import { SheetsService } from "../services/sheetsService.js";
import {
  parseUserSettings,
  serializeUserSettings,
  type Weekday
} from "../services/weeklyCheckinService.js";
import type { MetadataStore } from "../store/metadataStore.js";

type ProfileSheetsPort = Pick<SheetsService, "listRows">;
type ProfileGamificationPort = Pick<GamificationService, "getScoreboard" | "getStreakState">;

const settingsSchema = z.object({
  weeklyCheckinDay: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday"
  ]),
  strictWeeklyCheckin: z.boolean().default(true)
});

export function createProfileRoutes(
  metadataStore: MetadataStore,
  sheetsService: ProfileSheetsPort,
  gamificationService: ProfileGamificationPort
) {
  const router = Router();
  router.use(requireAuth);
  const insightsService = new ProfileInsightsService();

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

  router.get("/settings", async (req, res) => {
    const user = req.user!;
    const settings = parseUserSettings(user.settingsJson);
    res.json(settings);
  });

  router.post("/settings", async (req, res) => {
    const parsed = settingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const settings = {
      weeklyCheckinDay: parsed.data.weeklyCheckinDay as Weekday,
      strictWeeklyCheckin: parsed.data.strictWeeklyCheckin
    };
    const serialized = serializeUserSettings(settings);
    await metadataStore.updateUserSettings(user.userId, serialized);
    req.user = {
      ...user,
      settingsJson: serialized
    };
    res.json(settings);
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
    const insights = insightsService.buildWeeklyInsights({
      timezone: user.timezone,
      habits,
      completions,
      runs,
      weights,
      goals
    });
    res.json(insights);
  });

  router.get("/coach-insights", async (req, res) => {
    const user = req.user!;
    const [runs, weights, goals] = await Promise.all([
      sheetsService.listRows(user, "RunLog"),
      sheetsService.listRows(user, "WeightLog"),
      sheetsService.listRows(user, "Goals")
    ]);
    const coach = insightsService.buildCoachInsights({
      timezone: user.timezone,
      runs,
      weights,
      goals
    });
    res.json(coach);
  });

  return router;
}
