import type { Dispatch, FormEventHandler, SetStateAction } from "react";
import type {
  GenericRow,
  MetricFormState,
  MetricTrendRow,
  Scoreboard,
  StreakData,
  WeeklyInsights
} from "../../types/app";
import { Card } from "../ui/Card";
import { ProgressMeter } from "../ui/ProgressMeter";

interface ProfileSectionProps {
  email: string;
  scoreboard: Scoreboard | null;
  streaks: StreakData;
  weeklyInsights: WeeklyInsights | null;
  metricForm: MetricFormState;
  setMetricForm: Dispatch<SetStateAction<MetricFormState>>;
  handleMetricSubmit: FormEventHandler<HTMLFormElement>;
  metricTrendRows: MetricTrendRow[];
  metrics: GenericRow[];
}

export function ProfileSection({
  email,
  scoreboard,
  streaks,
  weeklyInsights,
  metricForm,
  setMetricForm,
  handleMetricSubmit,
  metricTrendRows,
  metrics
}: ProfileSectionProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="panel-block">
        <h2 className="font-display text-xl">Profile & Score</h2>
        <p className="mt-3 text-sm text-muted">{email}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Card title="Points" value={String(scoreboard?.points ?? 0)} />
          <Card title="Level" value={String(scoreboard?.level ?? 1)} />
          <Card title="Current streak" value={String(streaks.current)} />
          <Card title="Best streak" value={String(streaks.longest)} />
        </div>
        <p className="mt-4 text-sm text-muted">
          Required-goal adherence:{" "}
          <span className="font-semibold text-ink">{scoreboard?.adherencePercent ?? 0}%</span>
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
              <div className="rounded-lg bg-canvas p-2">Goal mode: {weeklyInsights.goalType}</div>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No weekly insight data yet.</p>
        )}
      </div>
      <div className="panel-block md:col-span-2">
        <h2 className="font-display text-xl">Weekly Body Check-in</h2>
        <form className="mt-4 grid gap-2 md:grid-cols-3" onSubmit={handleMetricSubmit}>
          <input
            className="field"
            placeholder="Weight kg"
            value={metricForm.weightKg}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, weightKg: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Waist cm"
            value={metricForm.waistCm}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, waistCm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Chest cm"
            value={metricForm.chestCm}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, chestCm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Hip cm"
            value={metricForm.hipCm}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, hipCm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Thigh cm"
            value={metricForm.thighCm}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, thighCm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Arm cm"
            value={metricForm.armCm}
            onChange={(e) => setMetricForm((prev) => ({ ...prev, armCm: e.target.value }))}
          />
          <button className="btn md:col-span-3" type="submit">
            Log body metrics
          </button>
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
                  Weight {entry.weight_kg || "-"}kg | Waist {entry.waist_cm || "-"}cm | Chest{" "}
                  {entry.chest_cm || "-"}cm
                </div>
                <div className="text-muted">
                  Hip {entry.hip_cm || "-"}cm | Thigh {entry.thigh_cm || "-"}cm | Arm{" "}
                  {entry.arm_cm || "-"}cm
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
