import {
  calculateWaterTargetMl,
  computeEnergyPlan,
  evaluateDailyStatus,
  type GoalPlan,
  type PersonMetrics
} from "@personal-care/shared-types";
import { Router } from "express";
import { z } from "zod";
import { localDateInTimeZone } from "../lib/date.js";
import { requireAuth } from "../middleware/auth.js";
import { searchFoodCalories } from "../services/openFoodFacts.js";
import { SheetsService } from "../services/sheetsService.js";
import { GamificationService } from "../services/gamificationService.js";

const foodSchema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().positive(),
  quantity: z.string().optional(),
  source: z.string().default("manual"),
  mealType: z.string().default("general")
});

const waterSchema = z.object({
  amountMl: z.coerce.number().positive()
});

const weightSchema = z.object({
  weightKg: z.coerce.number().positive(),
  goalPlan: z
    .object({
      mode: z.enum(["target_date", "weekly_rate"]),
      type: z.enum(["deficit", "surplus", "maintenance"]),
      currentWeightKg: z.coerce.number().positive(),
      targetWeightKg: z.coerce.number().positive(),
      targetDate: z.string().optional(),
      weeklyRateKg: z.coerce.number().optional(),
      activityMultiplier: z.coerce.number().min(1.1).max(2.5),
      age: z.coerce.number().int().positive(),
      sex: z.enum(["male", "female"]),
      heightCm: z.coerce.number().positive()
    })
    .optional()
});

function toNumber(value: string | undefined, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function createDietRoutes(
  sheetsService: SheetsService,
  gamificationService: GamificationService
) {
  const router = Router();
  router.use(requireAuth);

  router.get("/foods", async (req, res) => {
    const user = req.user!;
    const search = String(req.query.search ?? "").trim();
    if (search) {
      const data = await searchFoodCalories(search);
      res.json({ source: "openfoodfacts", items: data });
      return;
    }
    const date = String(req.query.date ?? localDateInTimeZone(user.timezone));
    const rows = await sheetsService.listRows(user, "FoodLog");
    res.json(rows.filter((row) => row.local_date === date));
  });

  router.post("/foods", async (req, res) => {
    const parsed = foodSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "FoodLog", {
      name: parsed.data.name,
      calories: parsed.data.calories,
      quantity: parsed.data.quantity ?? "1 serving",
      source: parsed.data.source,
      meal_type: parsed.data.mealType
    });
    res.status(201).json({ ok: true });
  });

  router.get("/water", async (req, res) => {
    const user = req.user!;
    const date = String(req.query.date ?? localDateInTimeZone(user.timezone));
    const rows = await sheetsService.listRows(user, "WaterLog");
    res.json(rows.filter((row) => row.local_date === date));
  });

  router.post("/water", async (req, res) => {
    const parsed = waterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "WaterLog", {
      amount_ml: parsed.data.amountMl
    });
    await gamificationService.recordScoreEvent(user, "water_target_hit");
    res.status(201).json({ ok: true });
  });

  router.get("/weight", async (req, res) => {
    const user = req.user!;
    const rows = await sheetsService.listRows(user, "WeightLog");
    res.json(rows);
  });

  router.post("/weight", async (req, res) => {
    const parsed = weightSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }
    const user = req.user!;
    await sheetsService.appendRow(user, "WeightLog", {
      weight_kg: parsed.data.weightKg
    });
    if (parsed.data.goalPlan) {
      const goal = parsed.data.goalPlan;
      await sheetsService.appendRow(user, "Goals", {
        mode: goal.mode,
        type: goal.type,
        current_weight_kg: goal.currentWeightKg,
        target_weight_kg: goal.targetWeightKg,
        target_date: goal.targetDate ?? "",
        weekly_rate_kg: goal.weeklyRateKg ?? "",
        activity_multiplier: goal.activityMultiplier,
        age: goal.age,
        sex: goal.sex,
        height_cm: goal.heightCm
      });
    }
    res.status(201).json({ ok: true });
  });

  router.get("/summary", async (req, res) => {
    const user = req.user!;
    const localDate = String(req.query.date ?? localDateInTimeZone(user.timezone));
    const [foodRows, waterRows, weightRows, goalRows] = await Promise.all([
      sheetsService.listRows(user, "FoodLog"),
      sheetsService.listRows(user, "WaterLog"),
      sheetsService.listRows(user, "WeightLog"),
      sheetsService.listRows(user, "Goals")
    ]);

    const todaysFoods = foodRows.filter((row) => row.local_date === localDate);
    const todaysWater = waterRows.filter((row) => row.local_date === localDate);

    const consumedCalories = todaysFoods.reduce(
      (sum, row) => sum + toNumber(row.calories),
      0
    );
    const waterConsumedMl = todaysWater.reduce(
      (sum, row) => sum + toNumber(row.amount_ml),
      0
    );

    const latestWeight = [...weightRows]
      .reverse()
      .map((row) => toNumber(row.weight_kg, NaN))
      .find((weight) => !Number.isNaN(weight));

    const latestGoal = [...goalRows].reverse()[0];
    const fallbackWeight = latestWeight ?? 70;

    const metrics: PersonMetrics = {
      age: toNumber(latestGoal?.age, 28),
      sex: latestGoal?.sex === "female" ? "female" : "male",
      heightCm: toNumber(latestGoal?.height_cm, 170),
      weightKg: fallbackWeight
    };

    const plan: GoalPlan = {
      mode:
        latestGoal?.mode === "target_date" || latestGoal?.mode === "weekly_rate"
          ? latestGoal.mode
          : "weekly_rate",
      type:
        latestGoal?.type === "deficit" ||
        latestGoal?.type === "surplus" ||
        latestGoal?.type === "maintenance"
          ? latestGoal.type
          : "maintenance",
      currentWeightKg: toNumber(latestGoal?.current_weight_kg, fallbackWeight),
      targetWeightKg: toNumber(latestGoal?.target_weight_kg, fallbackWeight),
      targetDate: latestGoal?.target_date,
      weeklyRateKg: toNumber(latestGoal?.weekly_rate_kg, 0.25),
      activityMultiplier: toNumber(latestGoal?.activity_multiplier, 1.35)
    };

    const energy = computeEnergyPlan(metrics, plan);
    const waterTargetMl = calculateWaterTargetMl(metrics.weightKg);
    const status = evaluateDailyStatus(consumedCalories, energy.targetCalories);

    if (status === "on_track") {
      await gamificationService.recordScoreEvent(user, "calorie_target_hit");
    }

    res.json({
      date: localDate,
      consumedCalories,
      targetCalories: energy.targetCalories,
      tdee: energy.tdee,
      waterTargetMl,
      waterConsumedMl,
      status,
      safetyWarnings: energy.safetyWarnings
    });
  });

  return router;
}
