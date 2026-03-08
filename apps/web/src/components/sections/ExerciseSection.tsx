import type { Dispatch, FormEventHandler, SetStateAction } from "react";
import type {
  GenericRow,
  LapFormState,
  RunFormState,
  WorkoutFormState
} from "../../types/app";
import { Card } from "../ui/Card";

interface ExerciseSectionProps {
  gpsTracking: boolean;
  gpsError: string;
  gpsDistanceKm: number;
  gpsDurationSec: number;
  gpsPointsLength: number;
  gpsLapSplits: number[];
  startGpsRun: () => void;
  stopGpsRun: () => Promise<void>;
  formatDuration: (totalSeconds: number) => string;
  runForm: RunFormState;
  setRunForm: Dispatch<SetStateAction<RunFormState>>;
  handleRunSubmit: FormEventHandler<HTMLFormElement>;
  lapForm: LapFormState;
  setLapForm: Dispatch<SetStateAction<LapFormState>>;
  handleLapSubmit: FormEventHandler<HTMLFormElement>;
  runs: GenericRow[];
  workoutForm: WorkoutFormState;
  setWorkoutForm: Dispatch<SetStateAction<WorkoutFormState>>;
  handleWorkoutSubmit: FormEventHandler<HTMLFormElement>;
  workouts: GenericRow[];
  completeWorkout: (workoutId: string) => Promise<void>;
}

export function ExerciseSection({
  gpsTracking,
  gpsError,
  gpsDistanceKm,
  gpsDurationSec,
  gpsPointsLength,
  gpsLapSplits,
  startGpsRun,
  stopGpsRun,
  formatDuration,
  runForm,
  setRunForm,
  handleRunSubmit,
  lapForm,
  setLapForm,
  handleLapSubmit,
  runs,
  workoutForm,
  setWorkoutForm,
  handleWorkoutSubmit,
  workouts,
  completeWorkout
}: ExerciseSectionProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="panel-block md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl">Live GPS Run</h2>
          <div className="flex flex-wrap gap-2">
            <button className="btn" disabled={gpsTracking} onClick={startGpsRun} type="button">
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
          <Card title="GPS points" value={String(gpsPointsLength)} />
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
          <input
            className="field"
            placeholder="Distance (km)"
            value={runForm.distanceKm}
            onChange={(e) => setRunForm((prev) => ({ ...prev, distanceKm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Duration (sec)"
            value={runForm.durationSec}
            onChange={(e) => setRunForm((prev) => ({ ...prev, durationSec: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Notes"
            value={runForm.notes}
            onChange={(e) => setRunForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
          <button className="btn" type="submit">
            Log run
          </button>
        </form>
        <form className="mt-4 grid gap-2" onSubmit={handleLapSubmit}>
          <select
            className="field"
            value={lapForm.runId}
            onChange={(e) => setLapForm((prev) => ({ ...prev, runId: e.target.value }))}
          >
            <option value="">Select run for lap</option>
            {runs.map((run) => (
              <option key={run.run_id} value={run.run_id}>
                {run.local_date} - {run.distance_km}km
              </option>
            ))}
          </select>
          <input
            className="field"
            placeholder="Lap number"
            value={lapForm.lapNumber}
            onChange={(e) => setLapForm((prev) => ({ ...prev, lapNumber: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Lap distance km"
            value={lapForm.lapDistanceKm}
            onChange={(e) => setLapForm((prev) => ({ ...prev, lapDistanceKm: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Lap duration sec"
            value={lapForm.lapDurationSec}
            onChange={(e) => setLapForm((prev) => ({ ...prev, lapDurationSec: e.target.value }))}
          />
          <button className="btn-secondary" type="submit">
            Add lap split
          </button>
        </form>
      </div>
      <div className="panel-block">
        <h2 className="font-display text-xl">Bodyweight Workout Plans</h2>
        <form className="mt-4 grid gap-2" onSubmit={handleWorkoutSubmit}>
          <input
            className="field"
            placeholder="Workout title"
            value={workoutForm.title}
            onChange={(e) => setWorkoutForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <select
            className="field"
            value={workoutForm.level}
            onChange={(e) =>
              setWorkoutForm((prev) => ({
                ...prev,
                level: e.target.value as WorkoutFormState["level"]
              }))
            }
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
          <select
            className="field"
            value={workoutForm.focus}
            onChange={(e) =>
              setWorkoutForm((prev) => ({
                ...prev,
                focus: e.target.value as WorkoutFormState["focus"]
              }))
            }
          >
            <option value="fat_loss">Fat loss</option>
            <option value="strength">Strength</option>
            <option value="mobility">Mobility</option>
          </select>
          <button className="btn" type="submit">
            Create workout plan
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {workouts.slice(-6).map((workout) => (
            <div
              key={workout.workout_id}
              className="flex items-center justify-between rounded-lg bg-canvas p-2 text-sm"
            >
              <span>
                {workout.title} ({workout.level}) | week {workout.week_index || "1"} | target{" "}
                {workout.target_sessions || "3"} sessions
              </span>
              <button
                className="btn-mini"
                onClick={() => void completeWorkout(workout.workout_id)}
                type="button"
              >
                Complete
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
