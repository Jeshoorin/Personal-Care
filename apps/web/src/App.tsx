import {
  calculateWaterTargetMl,
  type DailyEnergySummary
} from "@personal-care/shared-types";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, apiPost, syncOutbox, API_BASE_URL } from "./lib/api";
import { registerPush } from "./lib/push";

type TabKey = "dashboard" | "diet" | "exercise" | "routine" | "profile";

interface MeResponse {
  userId: string;
  email: string;
  name: string;
  timezone: string;
  spreadsheetId: string | null;
}

interface Scoreboard {
  points: number;
  level: number;
  totalEvents: number;
  adherencePercent: number;
}

interface StreakData {
  current: number;
  longest: number;
}

interface WeeklyInsights {
  weekStart: string;
  weekEnd: string;
  previousPeriodStart: string;
  previousPeriodEnd: string;
  daysElapsed: number;
  consistencyPercent: number;
  adherencePercent: number;
  improvementPercent: number;
  thisPeriodDistanceKm: number;
  previousPeriodDistanceKm: number;
  weightChangeKg: number;
  goalType: "deficit" | "surplus" | "maintenance";
}

type GenericRow = Record<string, string>;
interface GpsPoint {
  lat: number;
  lon: number;
  timestamp: number;
}

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

function Card({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="panel-block">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
}

function ProgressMeter({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>{label}</span>
        <span className="font-semibold text-ink">{safeValue}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent to-[#13b27b]"
          style={{ width: `${safeValue}%` }}
        />
      </div>
    </div>
  );
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

  const [dietSummary, setDietSummary] = useState<DailyEnergySummary | null>(null);
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

  const [foodForm, setFoodForm] = useState({ name: "", calories: "" });
  const [waterMl, setWaterMl] = useState("300");
  const [weightKg, setWeightKg] = useState("70");
  const [foodSearchTerm, setFoodSearchTerm] = useState("");

  const [runForm, setRunForm] = useState({ distanceKm: "", durationSec: "", notes: "" });
  const [lapForm, setLapForm] = useState({
    runId: "",
    lapNumber: "1",
    lapDistanceKm: "1",
    lapDurationSec: ""
  });
  const [workoutForm, setWorkoutForm] = useState({
    title: "",
    level: "beginner",
    focus: "fat_loss",
    weekIndex: "1",
    targetSessions: "3"
  });
  const [habitForm, setHabitForm] = useState({
    title: "",
    reminderTime: "08:00",
    required: true
  });
  const [reminderForm, setReminderForm] = useState({
    title: "",
    time: "09:00"
  });
  const [metricForm, setMetricForm] = useState({
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
        apiGet<DailyEnergySummary>("/diet/summary"),
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
    const result = await apiPost("/diet/weight", { weightKg: Number(weightKg) });
    if (isQueuedResponse(result)) {
      setStatusLine("Weight log queued for sync.");
    }
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
    const result = await apiPost(`/exercise/workouts/${workoutId}/complete`, {
      durationMin: 30,
      intensity: "moderate"
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Workout completion queued for sync.");
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
  const metricTrendRows = useMemo(() => {
    const sorted = [...metrics].sort((a, b) => {
      const aTime = new Date(a.created_at || `${a.local_date}T00:00:00Z`).getTime();
      const bTime = new Date(b.created_at || `${b.local_date}T00:00:00Z`).getTime();
      return aTime - bTime;
    });
    if (sorted.length === 0) {
      return [] as Array<{
        key: string;
        label: string;
        currentText: string;
        deltaText: string;
        target: string;
        statusLabel: string;
        statusClass: string;
      }>;
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
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <Card title="Calories" value={`${dietSummary?.consumedCalories ?? 0} kcal`} sub={`Target ${dietSummary?.targetCalories ?? 0}`} />
              <Card title="Water" value={`${dietSummary?.waterConsumedMl ?? 0} ml`} sub={`Target ${dietSummary?.waterTargetMl ?? waterTarget} ml`} />
              <Card title="Level" value={`L${scoreboard?.level ?? 1}`} sub={`${scoreboard?.points ?? 0} pts`} />
              <Card title="Streak" value={`${streaks.current} days`} sub={`Best ${streaks.longest} days`} />
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <div className="panel-block">
                <h2 className="font-display text-xl">Weight Progress</h2>
                <div className="mt-3 h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightChartData}>
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="weight" stroke="#0b7285" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="panel-block">
                <h2 className="font-display text-xl">Execution Status</h2>
                <p className="mt-3 text-sm text-muted">
                  Status: <span className="font-semibold text-ink">{dietSummary?.status ?? "n/a"}</span>
                </p>
                <div className="mt-4 space-y-3">
                  <ProgressMeter label="Calorie target alignment" value={calorieProgress} />
                  <ProgressMeter label="Hydration target alignment" value={waterProgress} />
                  <ProgressMeter label="Streak momentum" value={streakProgress} />
                </div>
                <div className="mt-4 rounded-xl bg-canvas p-3 text-sm text-muted">
                  Distance logged this cycle:
                  <span className="ml-1 font-semibold text-ink">{totalRunDistance.toFixed(1)} km</span>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "diet" ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="panel-block">
              <h2 className="font-display text-xl">Log Calories</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleFoodSubmit}>
                <input className="field" placeholder="Food name" value={foodForm.name} onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))} />
                <input className="field" placeholder="Calories" value={foodForm.calories} onChange={(e) => setFoodForm((prev) => ({ ...prev, calories: e.target.value }))} />
                <button className="btn" type="submit">Save food</button>
              </form>
              <form className="mt-4 grid gap-2" onSubmit={handleFoodSearch}>
                <input className="field" placeholder="Search food database" value={foodSearchTerm} onChange={(e) => setFoodSearchTerm(e.target.value)} />
                <button className="btn-secondary" type="submit">Search OpenFoodFacts</button>
              </form>
              <ul className="mt-3 space-y-2 text-sm">
                {foodSearch.slice(0, 5).map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="rounded-lg bg-canvas p-2">
                    {item.name} - {item.calories} kcal
                  </li>
                ))}
              </ul>
            </div>
            <div className="panel-block">
              <h2 className="font-display text-xl">Hydration & Weight</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleWaterSubmit}>
                <input className="field" placeholder="Water ml" value={waterMl} onChange={(e) => setWaterMl(e.target.value)} />
                <button className="btn" type="submit">Log water</button>
              </form>
              <form className="mt-4 grid gap-2" onSubmit={handleWeightSubmit}>
                <input className="field" placeholder="Weight kg" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
                <button className="btn-secondary" type="submit">Log weight</button>
              </form>
              <div className="mt-4 text-sm text-muted">
                Daily calories: {dietSummary?.consumedCalories ?? 0} / {dietSummary?.targetCalories ?? 0}
              </div>
            </div>
            <div className="panel-block md:col-span-2">
              <h3 className="font-display text-lg">Today food logs</h3>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                {foods.slice(-8).map((row) => (
                  <div key={row.entry_id} className="rounded-lg bg-canvas p-2 text-sm">
                    {row.name} - {row.calories} kcal
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "exercise" ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="panel-block md:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-xl">Live GPS Run</h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn"
                    disabled={gpsTracking}
                    onClick={startGpsRun}
                    type="button"
                  >
                    Start tracking
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={!gpsTracking}
                    onClick={() => void stopGpsRun()}
                    type="button"
                  >
                    Stop & save
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted">
                {gpsTracking
                  ? "Tracking in progress. Keep the screen on for best accuracy."
                  : "Use this when you want auto distance and 1 km lap splits."}
              </p>
              {gpsError ? <p className="mt-2 text-sm text-warn">{gpsError}</p> : null}
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
                <Card title="Distance" value={`${gpsDistanceKm.toFixed(2)} km`} />
                <Card title="Duration" value={formatDuration(gpsDurationSec)} />
                <Card title="GPS points" value={String(gpsPoints.length)} />
                <Card title="Laps (1 km)" value={String(gpsLapSplits.length)} />
              </div>
              {gpsLapSplits.length > 0 ? (
                <div className="mt-4 grid gap-2 md:grid-cols-3">
                  {gpsLapSplits.map((lapSec, index) => (
                    <div key={`gps-lap-${index + 1}`} className="rounded-lg bg-canvas p-2 text-sm">
                      Km {index + 1}: {formatDuration(lapSec)}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="panel-block">
              <h2 className="font-display text-xl">Jog Tracking</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleRunSubmit}>
                <input className="field" placeholder="Distance (km)" value={runForm.distanceKm} onChange={(e) => setRunForm((prev) => ({ ...prev, distanceKm: e.target.value }))} />
                <input className="field" placeholder="Duration (sec)" value={runForm.durationSec} onChange={(e) => setRunForm((prev) => ({ ...prev, durationSec: e.target.value }))} />
                <input className="field" placeholder="Notes" value={runForm.notes} onChange={(e) => setRunForm((prev) => ({ ...prev, notes: e.target.value }))} />
                <button className="btn" type="submit">Log run</button>
              </form>
              <form className="mt-4 grid gap-2" onSubmit={handleLapSubmit}>
                <select className="field" value={lapForm.runId} onChange={(e) => setLapForm((prev) => ({ ...prev, runId: e.target.value }))}>
                  <option value="">Select run for lap</option>
                  {runs.map((run) => (
                    <option key={run.run_id} value={run.run_id}>
                      {run.local_date} - {run.distance_km}km
                    </option>
                  ))}
                </select>
                <input className="field" placeholder="Lap number" value={lapForm.lapNumber} onChange={(e) => setLapForm((prev) => ({ ...prev, lapNumber: e.target.value }))} />
                <input className="field" placeholder="Lap distance km" value={lapForm.lapDistanceKm} onChange={(e) => setLapForm((prev) => ({ ...prev, lapDistanceKm: e.target.value }))} />
                <input className="field" placeholder="Lap duration sec" value={lapForm.lapDurationSec} onChange={(e) => setLapForm((prev) => ({ ...prev, lapDurationSec: e.target.value }))} />
                <button className="btn-secondary" type="submit">Add lap split</button>
              </form>
            </div>
            <div className="panel-block">
              <h2 className="font-display text-xl">Bodyweight Workout Plans</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleWorkoutSubmit}>
                <input className="field" placeholder="Workout title" value={workoutForm.title} onChange={(e) => setWorkoutForm((prev) => ({ ...prev, title: e.target.value }))} />
                <select className="field" value={workoutForm.level} onChange={(e) => setWorkoutForm((prev) => ({ ...prev, level: e.target.value }))}>
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <select className="field" value={workoutForm.focus} onChange={(e) => setWorkoutForm((prev) => ({ ...prev, focus: e.target.value }))}>
                  <option value="fat_loss">Fat loss</option>
                  <option value="strength">Strength</option>
                  <option value="mobility">Mobility</option>
                </select>
                <button className="btn" type="submit">Create workout plan</button>
              </form>
              <div className="mt-4 space-y-2">
                {workouts.slice(-6).map((workout) => (
                  <div key={workout.workout_id} className="flex items-center justify-between rounded-lg bg-canvas p-2 text-sm">
                    <span>{workout.title} ({workout.level})</span>
                    <button className="btn-mini" onClick={() => void completeWorkout(workout.workout_id)} type="button">
                      Complete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "routine" ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="panel-block">
              <h2 className="font-display text-xl">Daily Personal Routine</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleHabitSubmit}>
                <input className="field" placeholder="Task title" value={habitForm.title} onChange={(e) => setHabitForm((prev) => ({ ...prev, title: e.target.value }))} />
                <input className="field" placeholder="Reminder HH:mm" value={habitForm.reminderTime} onChange={(e) => setHabitForm((prev) => ({ ...prev, reminderTime: e.target.value }))} />
                <label className="inline-flex items-center gap-2 text-sm text-muted">
                  <input checked={habitForm.required} onChange={(e) => setHabitForm((prev) => ({ ...prev, required: e.target.checked }))} type="checkbox" />
                  Required task
                </label>
                <button className="btn" type="submit">Add habit</button>
              </form>
              <div className="mt-4 space-y-2">
                {habits.map((habit) => (
                  <div key={habit.habit_id} className="flex items-center justify-between rounded-lg bg-canvas p-2 text-sm">
                    <span>{habit.title}</span>
                    <button className="btn-mini" onClick={() => void checkHabit(habit.habit_id)} type="button">
                      Done
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="panel-block">
              <h2 className="font-display text-xl">Reminder Schedule</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleReminderSubmit}>
                <input className="field" placeholder="Reminder title" value={reminderForm.title} onChange={(e) => setReminderForm((prev) => ({ ...prev, title: e.target.value }))} />
                <input className="field" placeholder="Time HH:mm" value={reminderForm.time} onChange={(e) => setReminderForm((prev) => ({ ...prev, time: e.target.value }))} />
                <button className="btn-secondary" type="submit">Save reminder</button>
              </form>
              <div className="mt-4 space-y-2 text-sm">
                {reminders.map((item) => (
                  <div key={item.reminder_id} className="rounded-lg bg-canvas p-2">
                    {item.title} at {item.time}
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "profile" ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="panel-block">
              <h2 className="font-display text-xl">Profile & Score</h2>
              <p className="mt-3 text-sm text-muted">{me.email}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Card title="Points" value={String(scoreboard?.points ?? 0)} />
                <Card title="Level" value={String(scoreboard?.level ?? 1)} />
                <Card title="Current streak" value={String(streaks.current)} />
                <Card title="Best streak" value={String(streaks.longest)} />
              </div>
              <p className="mt-4 text-sm text-muted">
                Required-goal adherence:{" "}
                <span className="font-semibold text-ink">
                  {scoreboard?.adherencePercent ?? 0}%
                </span>
              </p>
            </div>
            <div className="panel-block">
              <h2 className="font-display text-xl">Weekly Performance Card</h2>
              {weeklyInsights ? (
                <>
                  <p className="mt-3 text-sm text-muted">
                    Window: {weeklyInsights.weekStart} to {weeklyInsights.weekEnd} ({weeklyInsights.daysElapsed} day
                    {weeklyInsights.daysElapsed > 1 ? "s" : ""})
                  </p>
                  <div className="mt-4 space-y-3">
                    <ProgressMeter label="Consistency" value={weeklyInsights.consistencyPercent} />
                    <ProgressMeter label="Adherence" value={weeklyInsights.adherencePercent} />
                    <ProgressMeter label="Improvement" value={weeklyInsights.improvementPercent} />
                  </div>
                  <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                    <div className="rounded-lg bg-canvas p-2">
                      Distance: {weeklyInsights.thisPeriodDistanceKm.toFixed(2)} km
                    </div>
                    <div className="rounded-lg bg-canvas p-2">
                      Previous: {weeklyInsights.previousPeriodDistanceKm.toFixed(2)} km
                    </div>
                    <div className="rounded-lg bg-canvas p-2">
                      Weight delta: {weeklyInsights.weightChangeKg > 0 ? "-" : "+"}
                      {Math.abs(weeklyInsights.weightChangeKg).toFixed(2)} kg
                    </div>
                    <div className="rounded-lg bg-canvas p-2">
                      Goal mode: {weeklyInsights.goalType}
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-sm text-muted">No weekly insight data yet.</p>
              )}
            </div>
            <div className="panel-block md:col-span-2">
              <h2 className="font-display text-xl">Weekly Body Check-in</h2>
              <form className="mt-4 grid gap-2 md:grid-cols-3" onSubmit={handleMetricSubmit}>
                <input className="field" placeholder="Weight kg" value={metricForm.weightKg} onChange={(e) => setMetricForm((prev) => ({ ...prev, weightKg: e.target.value }))} />
                <input className="field" placeholder="Waist cm" value={metricForm.waistCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, waistCm: e.target.value }))} />
                <input className="field" placeholder="Chest cm" value={metricForm.chestCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, chestCm: e.target.value }))} />
                <input className="field" placeholder="Hip cm" value={metricForm.hipCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, hipCm: e.target.value }))} />
                <input className="field" placeholder="Thigh cm" value={metricForm.thighCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, thighCm: e.target.value }))} />
                <input className="field" placeholder="Arm cm" value={metricForm.armCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, armCm: e.target.value }))} />
                <button className="btn md:col-span-3" type="submit">Log body metrics</button>
              </form>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-muted">
                      <th className="px-2 py-2">Metric</th>
                      <th className="px-2 py-2">Current</th>
                      <th className="px-2 py-2">Delta / week</th>
                      <th className="px-2 py-2">Target</th>
                      <th className="px-2 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metricTrendRows.map((row) => (
                      <tr key={row.key} className="border-b border-slate-100">
                        <td className="px-2 py-2 font-medium text-ink">{row.label}</td>
                        <td className="px-2 py-2 text-muted">{row.currentText}</td>
                        <td className="px-2 py-2 text-muted">{row.deltaText}</td>
                        <td className="px-2 py-2 text-muted">{row.target}</td>
                        <td className={`px-2 py-2 font-medium ${row.statusClass}`}>{row.statusLabel}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                {metrics
                  .slice(-6)
                  .reverse()
                  .map((entry) => (
                    <div key={entry.entry_id} className="rounded-lg bg-canvas p-2">
                      <div className="font-medium text-ink">{entry.local_date}</div>
                      <div className="text-muted">
                        Weight {entry.weight_kg || "-"}kg | Waist {entry.waist_cm || "-"}cm | Chest {entry.chest_cm || "-"}cm
                      </div>
                      <div className="text-muted">
                        Hip {entry.hip_cm || "-"}cm | Thigh {entry.thigh_cm || "-"}cm | Arm {entry.arm_cm || "-"}cm
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}

export default App;

