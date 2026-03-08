import type { Dispatch, FormEventHandler, SetStateAction } from "react";
import type {
  DietSummaryResponse,
  FoodFormState,
  GenericRow,
  GoalFormState
} from "../../types/app";

interface DietSectionProps {
  foodForm: FoodFormState;
  setFoodForm: Dispatch<SetStateAction<FoodFormState>>;
  handleFoodSubmit: FormEventHandler<HTMLFormElement>;
  foodSearchTerm: string;
  setFoodSearchTerm: Dispatch<SetStateAction<string>>;
  handleFoodSearch: FormEventHandler<HTMLFormElement>;
  foodSearch: GenericRow[];
  waterMl: string;
  setWaterMl: Dispatch<SetStateAction<string>>;
  handleWaterSubmit: FormEventHandler<HTMLFormElement>;
  weightKg: string;
  setWeightKg: Dispatch<SetStateAction<string>>;
  handleWeightSubmit: FormEventHandler<HTMLFormElement>;
  goalForm: GoalFormState;
  setGoalForm: Dispatch<SetStateAction<GoalFormState>>;
  dietSummary: DietSummaryResponse | null;
  foods: GenericRow[];
}

export function DietSection({
  foodForm,
  setFoodForm,
  handleFoodSubmit,
  foodSearchTerm,
  setFoodSearchTerm,
  handleFoodSearch,
  foodSearch,
  waterMl,
  setWaterMl,
  handleWaterSubmit,
  weightKg,
  setWeightKg,
  handleWeightSubmit,
  goalForm,
  setGoalForm,
  dietSummary,
  foods
}: DietSectionProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="panel-block">
        <h2 className="font-display text-xl">Log Calories</h2>
        <form className="mt-4 grid gap-2" onSubmit={handleFoodSubmit}>
          <input
            className="field"
            placeholder="Food name"
            value={foodForm.name}
            onChange={(e) => setFoodForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Calories"
            value={foodForm.calories}
            onChange={(e) => setFoodForm((prev) => ({ ...prev, calories: e.target.value }))}
          />
          <button className="btn" type="submit">
            Save food
          </button>
        </form>
        <form className="mt-4 grid gap-2" onSubmit={handleFoodSearch}>
          <input
            className="field"
            placeholder="Search food database"
            value={foodSearchTerm}
            onChange={(e) => setFoodSearchTerm(e.target.value)}
          />
          <button className="btn-secondary" type="submit">
            Search OpenFoodFacts
          </button>
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
          <input
            className="field"
            placeholder="Water ml"
            value={waterMl}
            onChange={(e) => setWaterMl(e.target.value)}
          />
          <button className="btn" type="submit">
            Log water
          </button>
        </form>
        <form className="mt-4 grid gap-2" onSubmit={handleWeightSubmit}>
          <input
            className="field"
            placeholder="Weight kg"
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
          />
          <button className="btn-secondary" type="submit">
            Log weight
          </button>
        </form>
        <div className="mt-4 rounded-xl bg-canvas p-3">
          <p className="text-xs uppercase tracking-[0.15em] text-muted">Calorie Goal Planner</p>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <select
              className="field"
              value={goalForm.mode}
              onChange={(e) =>
                setGoalForm((prev) => ({
                  ...prev,
                  mode: e.target.value as GoalFormState["mode"]
                }))
              }
            >
              <option value="weekly_rate">Weekly rate</option>
              <option value="target_date">Target date</option>
            </select>
            <select
              className="field"
              value={goalForm.type}
              onChange={(e) =>
                setGoalForm((prev) => ({
                  ...prev,
                  type: e.target.value as GoalFormState["type"]
                }))
              }
            >
              <option value="deficit">Deficit</option>
              <option value="maintenance">Maintenance</option>
              <option value="surplus">Surplus</option>
            </select>
            <input
              className="field"
              placeholder="Current weight kg"
              value={goalForm.currentWeightKg}
              onChange={(e) =>
                setGoalForm((prev) => ({ ...prev, currentWeightKg: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Target weight kg"
              value={goalForm.targetWeightKg}
              onChange={(e) =>
                setGoalForm((prev) => ({ ...prev, targetWeightKg: e.target.value }))
              }
            />
            {goalForm.mode === "target_date" ? (
              <input
                className="field"
                placeholder="Target date YYYY-MM-DD"
                value={goalForm.targetDate}
                onChange={(e) => setGoalForm((prev) => ({ ...prev, targetDate: e.target.value }))}
              />
            ) : (
              <input
                className="field"
                placeholder="Weekly rate kg"
                value={goalForm.weeklyRateKg}
                onChange={(e) =>
                  setGoalForm((prev) => ({ ...prev, weeklyRateKg: e.target.value }))
                }
              />
            )}
            <input
              className="field"
              placeholder="Activity multiplier (1.1-2.5)"
              value={goalForm.activityMultiplier}
              onChange={(e) =>
                setGoalForm((prev) => ({ ...prev, activityMultiplier: e.target.value }))
              }
            />
            <input
              className="field"
              placeholder="Age"
              value={goalForm.age}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, age: e.target.value }))}
            />
            <input
              className="field"
              placeholder="Height cm"
              value={goalForm.heightCm}
              onChange={(e) => setGoalForm((prev) => ({ ...prev, heightCm: e.target.value }))}
            />
            <select
              className="field"
              value={goalForm.sex}
              onChange={(e) =>
                setGoalForm((prev) => ({ ...prev, sex: e.target.value as GoalFormState["sex"] }))
              }
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="mt-4 text-sm text-muted">
          Daily calories: {dietSummary?.consumedCalories ?? 0} / {dietSummary?.targetCalories ?? 0}
        </div>
        <div className="mt-1 text-sm text-muted">Estimated TDEE: {dietSummary?.tdee ?? 0} kcal</div>
        {dietSummary?.safetyWarnings?.length ? (
          <div className="mt-3 rounded-lg border border-warn/30 bg-warn/10 p-2 text-sm text-warn">
            {dietSummary.safetyWarnings.map((warning, idx) => (
              <div key={`warn-${idx}`}>{warning}</div>
            ))}
          </div>
        ) : null}
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
  );
}
