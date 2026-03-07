import {
  calculateWaterTargetMl,
  type DailyEnergySummary
} from "@personal-care/shared-types";
import { type FormEvent, useEffect, useMemo, useState } from "react";
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

type GenericRow = Record<string, string>;

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
    <div className="rounded-2xl bg-panel p-4 shadow-panel">
      <p className="text-xs uppercase tracking-[0.1em] text-muted">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-ink">{value}</p>
      {sub ? <p className="mt-1 text-sm text-muted">{sub}</p> : null}
    </div>
  );
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
    chestCm: ""
  });

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
      chestCm: metricForm.chestCm ? Number(metricForm.chestCm) : undefined
    });
    if (isQueuedResponse(result)) {
      setStatusLine("Body metrics queued for sync.");
    }
    setMetricForm({ weightKg: "", waistCm: "", chestCm: "" });
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

  if (loading) {
    return <div className="p-8 font-body text-ink">Loading personal dashboard...</div>;
  }

  if (!me) {
    return (
      <div className="min-h-screen bg-canvas px-6 py-10 font-body text-ink">
        <div className="mx-auto max-w-2xl rounded-3xl bg-panel p-10 shadow-panel">
          <p className="text-sm uppercase tracking-[0.16em] text-muted">Personal Care</p>
          <h1 className="mt-3 font-display text-4xl font-semibold">
            Professional health assistant for your daily execution
          </h1>
          <p className="mt-4 text-muted">
            Sign in with Google to auto-create your personal tracking sheet in Drive.
          </p>
          <a
            className="mt-8 inline-flex rounded-xl bg-accent px-5 py-3 font-medium text-white"
            href={`${API_BASE_URL}/auth/google/start`}
          >
            Continue with Google
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas font-body text-ink">
      <header className="bg-gradient-to-r from-accent to-[#0ca678] px-6 py-8 text-white">
        <div className="mx-auto max-w-6xl">
          <p className="text-sm uppercase tracking-[0.18em] text-white/80">Personal Care Assistant</p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="font-display text-3xl font-semibold">{me.name}</h1>
              <p className="text-white/85">Daily discipline engine for health and routine execution</p>
            </div>
            <div className="flex gap-3">
              <button
                className="rounded-xl border border-white/40 px-4 py-2 text-sm"
                onClick={enablePushNotifications}
                type="button"
              >
                Enable Push
              </button>
              <button
                className="rounded-xl border border-white/40 px-4 py-2 text-sm"
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

      <nav className="mx-auto mt-6 flex max-w-6xl flex-wrap gap-2 px-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`rounded-xl px-4 py-2 text-sm ${
              activeTab === tab.key ? "bg-accent text-white" : "bg-panel text-ink shadow-panel"
            }`}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {statusLine ? (
        <div className="mx-auto mt-4 max-w-6xl px-6 text-sm text-accent">{statusLine}</div>
      ) : null}

      <main className="mx-auto grid max-w-6xl gap-4 px-6 py-6">
        {activeTab === "dashboard" ? (
          <>
            <section className="grid gap-4 md:grid-cols-4">
              <Card title="Calories" value={`${dietSummary?.consumedCalories ?? 0} kcal`} sub={`Target ${dietSummary?.targetCalories ?? 0}`} />
              <Card title="Water" value={`${dietSummary?.waterConsumedMl ?? 0} ml`} sub={`Target ${dietSummary?.waterTargetMl ?? waterTarget} ml`} />
              <Card title="Level" value={`L${scoreboard?.level ?? 1}`} sub={`${scoreboard?.points ?? 0} pts`} />
              <Card title="Streak" value={`${streaks.current} days`} sub={`Best ${streaks.longest} days`} />
            </section>
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
              <div className="rounded-2xl bg-panel p-4 shadow-panel">
                <h2 className="font-display text-xl">Execution Status</h2>
                <p className="mt-3 text-sm text-muted">
                  Status: <span className="font-semibold text-ink">{dietSummary?.status ?? "n/a"}</span>
                </p>
                <p className="mt-2 text-sm text-muted">
                  Required habit completion drives strict streak reset at day close.
                </p>
                <p className="mt-2 text-sm text-muted">
                  Adherence score: <span className="font-semibold text-ink">{scoreboard?.adherencePercent ?? 0}%</span>
                </p>
              </div>
            </section>
          </>
        ) : null}

        {activeTab === "diet" ? (
          <section className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel md:col-span-2">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
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
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
              <h2 className="font-display text-xl">Profile & Score</h2>
              <p className="mt-3 text-sm text-muted">{me.email}</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Card title="Points" value={String(scoreboard?.points ?? 0)} />
                <Card title="Level" value={String(scoreboard?.level ?? 1)} />
                <Card title="Current streak" value={String(streaks.current)} />
                <Card title="Best streak" value={String(streaks.longest)} />
              </div>
            </div>
            <div className="rounded-2xl bg-panel p-4 shadow-panel">
              <h2 className="font-display text-xl">Weekly Body Check-in</h2>
              <form className="mt-4 grid gap-2" onSubmit={handleMetricSubmit}>
                <input className="field" placeholder="Weight kg" value={metricForm.weightKg} onChange={(e) => setMetricForm((prev) => ({ ...prev, weightKg: e.target.value }))} />
                <input className="field" placeholder="Waist cm" value={metricForm.waistCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, waistCm: e.target.value }))} />
                <input className="field" placeholder="Chest cm" value={metricForm.chestCm} onChange={(e) => setMetricForm((prev) => ({ ...prev, chestCm: e.target.value }))} />
                <button className="btn" type="submit">Log body metrics</button>
              </form>
              <div className="mt-4 space-y-2 text-sm">
                {metrics.slice(-6).map((entry) => (
                  <div key={entry.entry_id} className="rounded-lg bg-canvas p-2">
                    {entry.local_date}: {entry.weight_kg}kg / waist {entry.waist_cm || "-"}cm
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
