import { calculateWaterTargetMl } from "@personal-care/shared-types";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { DashboardSection } from "./components/sections/DashboardSection";
import { DietSection } from "./components/sections/DietSection";
import { ExerciseSection } from "./components/sections/ExerciseSection";
import { ProfileSection } from "./components/sections/ProfileSection";
import { RoutineSection } from "./components/sections/RoutineSection";
import { Card } from "./components/ui/Card";
import { apiGet, apiPost, syncOutbox, API_BASE_URL } from "./lib/api";
import { registerPush } from "./lib/push";
import type {
  DietSummaryResponse,
  GenericRow,
  GoalFormState,
  GpsPoint,
  HabitFormState,
  LapFormState,
  MeResponse,
  MetricFormState,
  MetricTrendRow,
  ReminderFormState,
  RunFormState,
  Scoreboard,
  StreakData,
  TabKey,
  WeeklyInsights,
  WorkoutFormState,
  FoodFormState
} from "./types/app";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "diet", label: "Diet" },
  { key: "exercise", label: "Exercise" },
  { key: "routine", label: "Routine" },
  { key: "profile", label: "Profile" }
];

function isQueuedResponse(value: unknown): value is { queued: true } {
  return typeof value === "object" && value !== null && "queued" in value;
}

function formatDuration(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}m ${secs}s`;
}

function haversineDistanceKm(a: GpsPoint, b: GpsPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toFiniteNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabKey>("dashboard");
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusLine, setStatusLine] = useState<string>("");

  const [dietSummary, setDietSummary] = useState<DietSummaryResponse | null>(null);
  const [foods, setFoods] = useState<GenericRow[]>([]);
  const [weights, setWeights] = useState<GenericRow[]>([]);
  const [runs, setRuns] = useState<GenericRow[]>([]);
  const [workouts, setWorkouts] = useState<GenericRow[]>([]);
  const [habits, setHabits] = useState<GenericRow[]>([]);
  const [reminders, setReminders] = useState<GenericRow[]>([]);
  const [scoreboard, setScoreboard] = useState<Scoreboard | null>(null);
  const [streaks, setStreaks] = useState<StreakData>({ current: 0, longest: 0 });
  const [weeklyInsights, setWeeklyInsights] = useState<WeeklyInsights | null>(null);
  const [metrics, setMetrics] = useState<GenericRow[]>([]);
  const [foodSearch, setFoodSearch] = useState<GenericRow[]>([]);

  const [foodForm, setFoodForm] = useState<FoodFormState>({ name: "", calories: "" });
  const [waterMl, setWaterMl] = useState("300");
  const [weightKg, setWeightKg] = useState("70");
  const [foodSearchTerm, setFoodSearchTerm] = useState("");
  const [goalForm, setGoalForm] = useState<GoalFormState>({
    mode: "weekly_rate",
    type: "deficit",
    currentWeightKg: "70",
    targetWeightKg: "65",
    targetDate: "",
    weeklyRateKg: "0.4",
    activityMultiplier: "1.35",
    age: "28",
    sex: "male",
    heightCm: "170"
  });

  const [runForm, setRunForm] = useState<RunFormState>({
    distanceKm: "",
    durationSec: "",
    notes: ""
  });
  const [lapForm, setLapForm] = useState<LapFormState>({
    runId: "",
    lapNumber: "1",
    lapDistanceKm: "1",
    lapDurationSec: ""
  });
  const [workoutForm, setWorkoutForm] = useState<WorkoutFormState>({
    title: "",
    level: "beginner",
    focus: "fat_loss",
    weekIndex: "1",
    targetSessions: "3"
  });
  const [habitForm, setHabitForm] = useState<HabitFormState>({
    title: "",
    reminderTime: "08:00",
    required: true
  });
  const [reminderForm, setReminderForm] = useState<ReminderFormState>({
    title: "",
    time: "09:00"
  });
  const [metricForm, setMetricForm] = useState<MetricFormState>({
    weightKg: "",
    waistCm: "",
    chestCm: "",
    hipCm: "",
    thighCm: "",
    armCm: ""
  });
  const [gpsTracking, setGpsTracking] = useState(false);
  const [gpsError, setGpsError] = useState("");
  const [gpsDurationSec, setGpsDurationSec] = useState(0);
  const [gpsDistanceKm, setGpsDistanceKm] = useState(0);
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([]);
  const [gpsLapSplits, setGpsLapSplits] = useState<number[]>([]);

  const gpsWatchIdRef = useRef<number | null>(null);
  const gpsTimerIdRef = useRef<number | null>(null);
  const gpsDistanceRef = useRef(0);
  const gpsDurationRef = useRef(0);
  const gpsLastLapKmRef = useRef(0);
  const gpsLapStartSecRef = useRef(0);
  const gpsLapSplitsRef = useRef<number[]>([]);

  const latestWeight = useMemo(() => {
    const latest = weights[weights.length - 1];
    return latest ? Number(latest.weight_kg) : 70;
  }, [weights]);

  const waterTarget = useMemo(
    () => Math.round(calculateWaterTargetMl(latestWeight)),
    [latestWeight]
  );

  async function loadEverything() {
    setLoading(true);
    try {
      const profile = await apiGet<MeResponse>("/me");
      setMe(profile);

      const [
        summary,
        foodsData,
        weightData,
        runData,
        workoutData,
        habitData,
        reminderData,
        scoreData,
        streakData,
        weeklyData,
        metricData
      ] = await Promise.all([
        apiGet<DietSummaryResponse>("/diet/summary"),
        apiGet<GenericRow[]>("/diet/foods"),
        apiGet<GenericRow[]>("/diet/weight"),
        apiGet<GenericRow[]>("/exercise/runs"),
        apiGet<GenericRow[]>("/exercise/workouts"),
        apiGet<GenericRow[]>("/habits"),
        apiGet<GenericRow[]>("/reminders"),
        apiGet<Scoreboard>("/profile/scoreboard"),
        apiGet<StreakData>("/profile/streaks"),
        apiGet<WeeklyInsights>("/profile/weekly-insights"),
        apiGet<GenericRow[]>("/metrics/body")
      ]);

      setDietSummary(summary);
      setFoods(foodsData);
      setWeights(weightData);
      setRuns(runData);
      setWorkouts(workoutData);
      setHabits(habitData);
      setReminders(reminderData);
      setScoreboard(scoreData);
      setStreaks(streakData);
      setWeeklyInsights(weeklyData);
      setMetrics(metricData);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEverything();
  }, []);

  useEffect(() => {
    const handleOnline = async () => {
      const synced = await syncOutbox();
      if (synced > 0) {
        setStatusLine(`${synced} offline item(s) synced.`);
        await loadEverything();
      }
    };
    window.addEventListener("online", handleOnline);
    const id = window.setInterval(() => {
      void handleOnline();
    }, 20_000);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null && navigator.geolocation) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
      if (gpsTimerIdRef.current !== null) {
        window.clearInterval(gpsTimerIdRef.current);
      }
    };
  }, []);

  async function handleFoodSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/diet/foods", {
      name: foodForm.name,
      calories: Number(foodForm.calories)
    });
    setFoodForm({ name: "", calories: "" });
    if (isQueuedResponse(result)) {
      setStatusLine("Food entry queued for sync.");
    }
    await loadEverything();
  }

  async function handleWaterSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/diet/water", { amountMl: Number(waterMl) });
    if (isQueuedResponse(result)) {
      setStatusLine("Water log queued for sync.");
    }
    await loadEverything();
  }

  async function handleWeightSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/diet/weight", {
      weightKg: Number(weightKg),
      goalPlan: {
        mode: goalForm.mode as "target_date" | "weekly_rate",
        type: goalForm.type as "deficit" | "surplus" | "maintenance",
        currentWeightKg: Number(goalForm.currentWeightKg || weightKg),
        targetWeightKg: Number(goalForm.targetWeightKg || weightKg),
        targetDate:
          goalForm.mode === "target_date" && goalForm.targetDate
            ? goalForm.targetDate
            : undefined,
        weeklyRateKg:
          goalForm.mode === "weekly_rate"
            ? Number(goalForm.weeklyRateKg || 0.4)
            : undefined,
        activityMultiplier: Number(goalForm.activityMultiplier || 1.35),
        age: Number(goalForm.age || 28),
        sex: goalForm.sex as "male" | "female",
        heightCm: Number(goalForm.heightCm || 170)
      }
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Weight log queued for sync.");
    }
    setGoalForm((prev) => ({ ...prev, currentWeightKg: weightKg }));
    setWeightKg("");
    await loadEverything();
  }

  async function handleFoodSearch(e: FormEvent) {
    e.preventDefault();
    const data = await apiGet<{ items: GenericRow[] }>(
      `/diet/foods?search=${encodeURIComponent(foodSearchTerm)}`
    );
    setFoodSearch(data.items);
  }

  async function handleRunSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/exercise/runs", {
      distanceKm: Number(runForm.distanceKm),
      durationSec: Number(runForm.durationSec),
      notes: runForm.notes
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Run entry queued for sync.");
    }
    setRunForm({ distanceKm: "", durationSec: "", notes: "" });
    await loadEverything();
  }

  function resetGpsSessionState() {
    gpsDistanceRef.current = 0;
    gpsDurationRef.current = 0;
    gpsLastLapKmRef.current = 0;
    gpsLapStartSecRef.current = 0;
    gpsLapSplitsRef.current = [];
    setGpsDistanceKm(0);
    setGpsDurationSec(0);
    setGpsPoints([]);
    setGpsLapSplits([]);
  }

  function startGpsRun() {
    if (gpsTracking) return;
    if (!navigator.geolocation) {
      setGpsError("Geolocation is not supported in this browser.");
      return;
    }

    setGpsError("");
    resetGpsSessionState();
    setGpsTracking(true);
    setStatusLine("GPS run started.");

    gpsTimerIdRef.current = window.setInterval(() => {
      gpsDurationRef.current += 1;
      setGpsDurationSec(gpsDurationRef.current);
    }, 1000);

    gpsWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: GpsPoint = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          timestamp: position.timestamp
        };

        setGpsPoints((previous) => {
          if (previous.length === 0) {
            return [point];
          }
          const lastPoint = previous[previous.length - 1];
          const segmentKm = haversineDistanceKm(lastPoint, point);
          if (!Number.isFinite(segmentKm) || segmentKm <= 0.005) {
            return previous;
          }

          const nextDistance = gpsDistanceRef.current + segmentKm;
          gpsDistanceRef.current = nextDistance;
          setGpsDistanceKm(Number(nextDistance.toFixed(3)));

          const completedKm = Math.floor(nextDistance);
          while (gpsLastLapKmRef.current < completedKm) {
            const lapDuration = gpsDurationRef.current - gpsLapStartSecRef.current;
            if (lapDuration > 0) {
              gpsLapSplitsRef.current = [...gpsLapSplitsRef.current, lapDuration];
              setGpsLapSplits(gpsLapSplitsRef.current);
            }
            gpsLastLapKmRef.current += 1;
            gpsLapStartSecRef.current = gpsDurationRef.current;
          }

          return [...previous, point];
        });
      },
      (error) => {
        if (gpsWatchIdRef.current !== null && navigator.geolocation) {
          navigator.geolocation.clearWatch(gpsWatchIdRef.current);
          gpsWatchIdRef.current = null;
        }
        if (gpsTimerIdRef.current !== null) {
          window.clearInterval(gpsTimerIdRef.current);
          gpsTimerIdRef.current = null;
        }
        setGpsTracking(false);
        setGpsError(`GPS error: ${error.message}`);
        setStatusLine("GPS tracking stopped due to location error.");
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  }

  async function stopGpsRun() {
    if (!gpsTracking) return;
    setGpsTracking(false);

    if (gpsWatchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    if (gpsTimerIdRef.current !== null) {
      window.clearInterval(gpsTimerIdRef.current);
      gpsTimerIdRef.current = null;
    }

    if (gpsDistanceRef.current < 0.1 || gpsDurationRef.current < 10) {
      setStatusLine("GPS run stopped. Not saved because distance/time was too low.");
      return;
    }

    const runResult = await apiPost<{ runId: string }>("/exercise/runs", {
      distanceKm: Number(gpsDistanceRef.current.toFixed(2)),
      durationSec: gpsDurationRef.current,
      notes: `GPS live run (${gpsPoints.length} points)`
    });

    if (isQueuedResponse(runResult)) {
      setStatusLine("GPS run queued for sync. Lap splits will need manual review.");
      return;
    }

    const runId = runResult.runId;
    for (let i = 0; i < gpsLapSplitsRef.current.length; i += 1) {
      await apiPost(`/exercise/runs/${runId}/laps`, {
        lapNumber: i + 1,
        lapDistanceKm: 1,
        lapDurationSec: gpsLapSplitsRef.current[i]
      });
    }

    setStatusLine(
      `GPS run saved: ${gpsDistanceRef.current.toFixed(2)} km in ${formatDuration(
        gpsDurationRef.current
      )}.`
    );
    await loadEverything();
  }

  async function handleLapSubmit(e: FormEvent) {
    e.preventDefault();
    if (!lapForm.runId) return;
    const result = await apiPost(`/exercise/runs/${lapForm.runId}/laps`, {
      lapNumber: Number(lapForm.lapNumber),
      lapDistanceKm: Number(lapForm.lapDistanceKm),
      lapDurationSec: Number(lapForm.lapDurationSec)
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Lap split queued for sync.");
    }
    setLapForm({ ...lapForm, lapDurationSec: "" });
  }

  async function handleWorkoutSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/exercise/workouts", {
      title: workoutForm.title,
      level: workoutForm.level,
      focus: workoutForm.focus,
      weekIndex: Number(workoutForm.weekIndex),
      targetSessions: Number(workoutForm.targetSessions)
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Workout plan queued for sync.");
    }
    setWorkoutForm({
      title: "",
      level: "beginner",
      focus: "fat_loss",
      weekIndex: "1",
      targetSessions: "3"
    });
    await loadEverything();
  }

  async function completeWorkout(workoutId: string) {
    const result = await apiPost<{ ok: true; progressedToWeek: number | null }>(
      `/exercise/workouts/${workoutId}/complete`,
      {
      durationMin: 30,
      intensity: "moderate"
      }
    );
    if (isQueuedResponse(result)) {
      setStatusLine("Workout completion queued for sync.");
    } else if (result.progressedToWeek) {
      setStatusLine(`Workout completed. Next week plan generated (Week ${result.progressedToWeek}).`);
    } else {
      setStatusLine("Workout session completed.");
    }
    await loadEverything();
  }

  async function handleHabitSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/habits", {
      title: habitForm.title,
      reminderTime: habitForm.reminderTime,
      required: habitForm.required
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Habit queued for sync.");
    }
    setHabitForm({ ...habitForm, title: "" });
    await loadEverything();
  }

  async function checkHabit(habitId: string) {
    const result = await apiPost(`/habits/${habitId}/check`, { completed: true });
    if (isQueuedResponse(result)) {
      setStatusLine("Habit completion queued for sync.");
    }
    await loadEverything();
  }

  async function handleReminderSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/reminders", {
      title: reminderForm.title,
      time: reminderForm.time,
      enabled: true,
      type: "habit"
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Reminder queued for sync.");
    }
    setReminderForm({ title: "", time: "09:00" });
    await loadEverything();
  }

  async function handleMetricSubmit(e: FormEvent) {
    e.preventDefault();
    const result = await apiPost("/metrics/body", {
      weightKg: Number(metricForm.weightKg),
      waistCm: metricForm.waistCm ? Number(metricForm.waistCm) : undefined,
      chestCm: metricForm.chestCm ? Number(metricForm.chestCm) : undefined,
      hipCm: metricForm.hipCm ? Number(metricForm.hipCm) : undefined,
      thighCm: metricForm.thighCm ? Number(metricForm.thighCm) : undefined,
      armCm: metricForm.armCm ? Number(metricForm.armCm) : undefined
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Body metrics queued for sync.");
    }
    setMetricForm({
      weightKg: "",
      waistCm: "",
      chestCm: "",
      hipCm: "",
      thighCm: "",
      armCm: ""
    });
    await loadEverything();
  }

  async function enablePushNotifications() {
    await registerPush();
    setStatusLine("Push notifications enabled.");
  }

  const weightChartData = weights.map((row) => ({
    date: row.local_date,
    weight: Number(row.weight_kg)
  }));
  const calorieProgress = dietSummary?.targetCalories
    ? clamp((dietSummary.consumedCalories / dietSummary.targetCalories) * 100, 0, 100)
    : 0;
  const waterProgress = dietSummary?.waterTargetMl
    ? clamp((dietSummary.waterConsumedMl / dietSummary.waterTargetMl) * 100, 0, 100)
    : 0;
  const streakProgress = clamp((streaks.current / Math.max(1, streaks.longest || 7)) * 100, 0, 100);
  const totalRunDistance = runs.reduce(
    (acc, row) => acc + Number(row.distance_km || 0),
    0
  );
  const metricTrendRows = useMemo<MetricTrendRow[]>(() => {
    const sorted = [...metrics].sort((a, b) => {
      const aTime = new Date(a.created_at || `${a.local_date}T00:00:00Z`).getTime();
      const bTime = new Date(b.created_at || `${b.local_date}T00:00:00Z`).getTime();
      return aTime - bTime;
    });
    if (sorted.length === 0) {
      return [];
    }

    const latest = sorted[sorted.length - 1];
    const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    const latestDate = new Date(`${latest.local_date || "1970-01-01"}T00:00:00Z`);
    const previousDate = previous
      ? new Date(`${previous.local_date || "1970-01-01"}T00:00:00Z`)
      : null;
    const daysBetween = previousDate
      ? Math.max(1, Math.round((latestDate.getTime() - previousDate.getTime()) / 86_400_000))
      : 7;

    const definitions = [
      { key: "weight_kg", label: "Weight", unit: "kg", min: -0.8, max: -0.2, target: "-0.2 to -0.8 kg/week" },
      { key: "waist_cm", label: "Waist", unit: "cm", min: -1.5, max: -0.2, target: "-0.2 to -1.5 cm/week" },
      { key: "chest_cm", label: "Chest", unit: "cm", min: -0.8, max: 0.4, target: "Stable (-0.8 to +0.4 cm/week)" },
      { key: "hip_cm", label: "Hip", unit: "cm", min: -1.5, max: -0.2, target: "-0.2 to -1.5 cm/week" },
      { key: "thigh_cm", label: "Thigh", unit: "cm", min: -1.2, max: -0.1, target: "-0.1 to -1.2 cm/week" },
      { key: "arm_cm", label: "Arm", unit: "cm", min: -0.8, max: 0.4, target: "Stable (-0.8 to +0.4 cm/week)" }
    ] as const;

    return definitions.map((definition) => {
      const current = toFiniteNumber(latest[definition.key]);
      const previousValue = previous ? toFiniteNumber(previous[definition.key]) : null;
      const weeklyDelta =
        current !== null && previousValue !== null
          ? ((current - previousValue) / daysBetween) * 7
          : null;

      const onTarget =
        weeklyDelta !== null && weeklyDelta >= definition.min && weeklyDelta <= definition.max;

      return {
        key: definition.key,
        label: definition.label,
        currentText: current !== null ? `${current.toFixed(1)} ${definition.unit}` : "-",
        deltaText:
          weeklyDelta !== null
            ? `${weeklyDelta > 0 ? "+" : ""}${weeklyDelta.toFixed(2)} ${definition.unit}/wk`
            : "Need one more weekly entry",
        target: definition.target,
        statusLabel:
          weeklyDelta === null ? "Not enough data" : onTarget ? "On target" : "Adjust plan",
        statusClass:
          weeklyDelta === null ? "text-muted" : onTarget ? "text-success" : "text-warn"
      };
    });
  }, [metrics]);

  if (loading) {
    return <div className="loading-screen">Loading personal dashboard...</div>;
  }

  if (!me) {
    return (
      <div className="app-background font-body text-ink">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <div className="hero-shell">
            <p className="text-sm uppercase tracking-[0.16em] text-muted">Personal Care</p>
            <h1 className="mt-3 font-display text-4xl font-semibold leading-tight md:text-5xl">
              Professional personal assistant for health execution
            </h1>
            <p className="mt-4 max-w-3xl text-muted">
              Track calories, workouts, streaks, and routines in one clean dashboard with Google authentication and persistent cloud storage.
            </p>
            <a
              className="btn-primary mt-8 inline-flex"
              href={`${API_BASE_URL}/auth/google/start`}
            >
              Authenticate with Google
            </a>
            <div className="mt-8 grid gap-3 md:grid-cols-3">
              <Card title="Storage" value="Google Sheets" sub="Auto-created in your drive" />
              <Card title="Focus" value="Daily Streak" sub="Strict routine discipline" />
              <Card title="Platform" value="PWA Ready" sub="Offline queue + push alerts" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-background font-body text-ink">
      <header className="header-shell">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm uppercase tracking-[0.18em] text-white/80">Personal Care Assistant</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold">{me.name}</h1>
              <p className="text-white/85">Daily discipline engine for health and routine execution</p>
            </div>
            <div className="flex gap-3">
              <button
                className="btn-soft"
                onClick={enablePushNotifications}
                type="button"
              >
                Enable Push
              </button>
              <button
                className="btn-soft"
                onClick={async () => {
                  await apiPost("/auth/logout", {});
                  window.location.reload();
                }}
                type="button"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="tab-row">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`tab-chip ${
              activeTab === tab.key ? "tab-chip-active" : "tab-chip-idle"
            }`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {statusLine ? (
        <div className="status-banner">{statusLine}</div>
      ) : null}

      <main className="content-grid">
        {activeTab === "dashboard" ? (
          <DashboardSection
            dietSummary={dietSummary}
            waterTarget={waterTarget}
            scoreboard={scoreboard}
            streaks={streaks}
            weightChartData={weightChartData}
            calorieProgress={calorieProgress}
            waterProgress={waterProgress}
            streakProgress={streakProgress}
            totalRunDistance={totalRunDistance}
          />
        ) : null}

        {activeTab === "diet" ? (
          <DietSection
            foodForm={foodForm}
            setFoodForm={setFoodForm}
            handleFoodSubmit={handleFoodSubmit}
            foodSearchTerm={foodSearchTerm}
            setFoodSearchTerm={setFoodSearchTerm}
            handleFoodSearch={handleFoodSearch}
            foodSearch={foodSearch}
            waterMl={waterMl}
            setWaterMl={setWaterMl}
            handleWaterSubmit={handleWaterSubmit}
            weightKg={weightKg}
            setWeightKg={setWeightKg}
            handleWeightSubmit={handleWeightSubmit}
            goalForm={goalForm}
            setGoalForm={setGoalForm}
            dietSummary={dietSummary}
            foods={foods}
          />
        ) : null}

        {activeTab === "exercise" ? (
          <ExerciseSection
            gpsTracking={gpsTracking}
            gpsError={gpsError}
            gpsDistanceKm={gpsDistanceKm}
            gpsDurationSec={gpsDurationSec}
            gpsPointsLength={gpsPoints.length}
            gpsLapSplits={gpsLapSplits}
            startGpsRun={startGpsRun}
            stopGpsRun={stopGpsRun}
            formatDuration={formatDuration}
            runForm={runForm}
            setRunForm={setRunForm}
            handleRunSubmit={handleRunSubmit}
            lapForm={lapForm}
            setLapForm={setLapForm}
            handleLapSubmit={handleLapSubmit}
            runs={runs}
            workoutForm={workoutForm}
            setWorkoutForm={setWorkoutForm}
            handleWorkoutSubmit={handleWorkoutSubmit}
            workouts={workouts}
            completeWorkout={completeWorkout}
          />
        ) : null}

        {activeTab === "routine" ? (
          <RoutineSection
            habitForm={habitForm}
            setHabitForm={setHabitForm}
            handleHabitSubmit={handleHabitSubmit}
            habits={habits}
            checkHabit={checkHabit}
            reminderForm={reminderForm}
            setReminderForm={setReminderForm}
            handleReminderSubmit={handleReminderSubmit}
            reminders={reminders}
          />
        ) : null}

        {activeTab === "profile" ? (
          <ProfileSection
            email={me.email}
            scoreboard={scoreboard}
            streaks={streaks}
            weeklyInsights={weeklyInsights}
            metricForm={metricForm}
            setMetricForm={setMetricForm}
            handleMetricSubmit={handleMetricSubmit}
            metricTrendRows={metricTrendRows}
            metrics={metrics}
          />
        ) : null}
      </main>
    </div>
  );
}

export default App;

