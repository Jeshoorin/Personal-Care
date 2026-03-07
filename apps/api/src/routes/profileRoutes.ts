import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { GamificationService } from "../services/gamificationService.js";
import { SheetsService } from "../services/sheetsService.js";

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

  return router;
}
