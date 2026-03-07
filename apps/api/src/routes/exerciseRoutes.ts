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
    res.status(201).json({ ok: true });
  });

  return router;
}
