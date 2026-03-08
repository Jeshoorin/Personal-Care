import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DietSummaryResponse, Scoreboard, StreakData } from "../../types/app";
import { Card } from "../ui/Card";
import { ProgressMeter } from "../ui/ProgressMeter";

interface DashboardSectionProps {
  dietSummary: DietSummaryResponse | null;
  waterTarget: number;
  scoreboard: Scoreboard | null;
  streaks: StreakData;
  weightChartData: Array<{ date: string; weight: number }>;
  calorieProgress: number;
  waterProgress: number;
  streakProgress: number;
  totalRunDistance: number;
}

export function DashboardSection({
  dietSummary,
  waterTarget,
  scoreboard,
  streaks,
  weightChartData,
  calorieProgress,
  waterProgress,
  streakProgress,
  totalRunDistance
}: DashboardSectionProps) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <Card
          title="Calories"
          value={`${dietSummary?.consumedCalories ?? 0} kcal`}
          sub={`Target ${dietSummary?.targetCalories ?? 0}`}
        />
        <Card
          title="Water"
          value={`${dietSummary?.waterConsumedMl ?? 0} ml`}
          sub={`Target ${dietSummary?.waterTargetMl ?? waterTarget} ml`}
        />
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
  );
}
