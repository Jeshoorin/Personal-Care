import { Router } from "express";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { requireAuth } from "../middleware/auth.js";
import { SheetsService } from "../services/sheetsService.js";
import { GamificationService } from "../services/gamificationService.js";

const runSchema = z.object({
  distanceKm: z.coerce.number().positive(),
  durationSec: z.coerce.number().positive(),
  notes: z.string().optional()
});

const lapSchema = z.object({
  lapNumber: z.coerce.number().int().positive(),
  lapDistanceKm: z.coerce.number().positive(),
  lapDurationSec: z.coerce.number().positive()
});

const workoutSchema = z.object({
  title: z.string().min(1),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  focus: z.enum(["fat_loss", "strength", "mobility"]),
  weekIndex: z.coerce.number().int().positive(),
  targetSessions: z.coerce.number().int().positive().default(3)
});

const completeWorkoutSchema = z.object({
  durationMin: z.coerce.number().positive(),
  intensity: z.enum(["low", "moderate", "high"]).default("moderate")
});

const STARTER_WORKOUTS = [
  {
    title: "Starter Bodyweight Cut",
    level: "beginner",
    focus: "fat_loss",
    weekIndex: 1,
    targetSessions: 3
  },
  {
    title: "Strength Builder Circuit",
    level: "intermediate",
    focus: "strength",
    weekIndex: 1,
    targetSessions: 4
  },
  {
    title: "Mobility and Core Flow",
    level: "advanced",
    focus: "mobility",
    weekIndex: 1,
    targetSessions: 5
  }
] as const;

function normalizeWorkoutTitle(title: string): string {
  return title.replace(/\s-\sWeek\s\d+$/i, "").trim();
}

export function createExerciseRoutes(
  sheetsService: SheetsService,
  gamificationService: GamificationService
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/runs", async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "RunLog");
    res.json(rows);
  });

  router.post("/runs", async (req, res) => {
    const parsed = runSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const runId = uuidv4();
    await sheetsService.appendRow(user, "RunLog", {
      run_id: runId,
      distance_km: parsed.data.distanceKm,
      duration_sec: parsed.data.durationSec,
      notes: parsed.data.notes ?? ""
    });
    await gamificationService.recordScoreEvent(user, "run_logged");
    res.status(201).json({ runId });
  });

  router.get("/runs/:id/laps", async (req, res) => {
    const user = req.user!;
    const runId = req.params.id;
    const rows = await sheetsService.listRows(user, "RunLaps");
    res.json(rows.filter((row) => row.run_id === runId));
  });

  router.post("/runs/:id/laps", async (req, res) => {
    const parsed = lapSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const runId = req.params.id;
    await sheetsService.appendRow(user, "RunLaps", {
      lap_id: uuidv4(),
      run_id: runId,
      lap_number: parsed.data.lapNumber,
      lap_distance_km: parsed.data.lapDistanceKm,
      lap_duration_sec: parsed.data.lapDurationSec
    });
    res.status(201).json({ ok: true });
  });

  router.get("/workouts", async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "WorkoutPlans");
    if (rows.length === 0) {
      for (const template of STARTER_WORKOUTS) {
        await sheetsService.appendRow(user, "WorkoutPlans", {
          workout_id: uuidv4(),
          title: template.title,
          level: template.level,
          focus: template.focus,
          week_index: template.weekIndex,
          target_sessions: template.targetSessions
        });
      }
      const seeded = await sheetsService.listRows(user, "WorkoutPlans");
      res.json(seeded);
      return;
    }
    res.json(rows);
  });

  router.post("/workouts", async (req, res) => {
    const parsed = workoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    const workoutId = uuidv4();
    await sheetsService.appendRow(user, "WorkoutPlans", {
      workout_id: workoutId,
      title: parsed.data.title,
      level: parsed.data.level,
      focus: parsed.data.focus,
      week_index: parsed.data.weekIndex,
      target_sessions: parsed.data.targetSessions
    });
    res.status(201).json({ workoutId });
  });

  router.post("/workouts/:id/complete", async (req, res) => {
    const parsed = completeWorkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "WorkoutSessions", {
      session_id: uuidv4(),
      workout_id: req.params.id,
      duration_min: parsed.data.durationMin,
      completed: true,
      intensity: parsed.data.intensity
    });
    await gamificationService.recordScoreEvent(user, "workout_completed");

    const plans = await sheetsService.listRows(user, "WorkoutPlans");
    const sessions = await sheetsService.listRows(user, "WorkoutSessions");
    const currentPlan = plans.find((plan) => plan.workout_id === req.params.id);

    let progressedToWeek: number | null = null;
    if (currentPlan) {
      const targetSessions = Math.max(1, Number(currentPlan.target_sessions || 3));
      const completedSessions = sessions.filter(
        (session) => session.workout_id === req.params.id && session.completed === "true"
      ).length;

      if (completedSessions === targetSessions) {
        const currentWeek = Math.max(1, Number(currentPlan.week_index || 1));
        const nextWeek = currentWeek + 1;
        const baseTitle = normalizeWorkoutTitle(currentPlan.title || "Bodyweight Plan");
        const nextTitle = `${baseTitle} - Week ${nextWeek}`;

        const nextWeekExists = plans.some((plan) => {
          const planWeek = Number(plan.week_index || 0);
          return (
            normalizeWorkoutTitle(plan.title || "") === baseTitle &&
            plan.level === currentPlan.level &&
            plan.focus === currentPlan.focus &&
            planWeek === nextWeek
          );
        });

        if (!nextWeekExists) {
          const nextTarget = Math.min(
            currentPlan.level === "advanced" ? 7 : 6,
            targetSessions + 1
          );
          await sheetsService.appendRow(user, "WorkoutPlans", {
            workout_id: uuidv4(),
            title: nextTitle,
            level: currentPlan.level,
            focus: currentPlan.focus,
            week_index: nextWeek,
            target_sessions: nextTarget
          });
          progressedToWeek = nextWeek;
        }
      }
    }

    res.status(201).json({ ok: true, progressedToWeek });
  });

  return router;
}
