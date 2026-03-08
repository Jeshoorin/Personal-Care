import type { Dispatch, FormEventHandler, SetStateAction } from "react";
import type {
  GenericRow,
  HabitFormState,
  ReminderFormState
} from "../../types/app";

interface RoutineSectionProps {
  habitForm: HabitFormState;
  setHabitForm: Dispatch<SetStateAction<HabitFormState>>;
  handleHabitSubmit: FormEventHandler<HTMLFormElement>;
  habits: GenericRow[];
  checkHabit: (habitId: string) => Promise<void>;
  reminderForm: ReminderFormState;
  setReminderForm: Dispatch<SetStateAction<ReminderFormState>>;
  handleReminderSubmit: FormEventHandler<HTMLFormElement>;
  reminders: GenericRow[];
}

export function RoutineSection({
  habitForm,
  setHabitForm,
  handleHabitSubmit,
  habits,
  checkHabit,
  reminderForm,
  setReminderForm,
  handleReminderSubmit,
  reminders
}: RoutineSectionProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="panel-block">
        <h2 className="font-display text-xl">Daily Personal Routine</h2>
        <form className="mt-4 grid gap-2" onSubmit={handleHabitSubmit}>
          <input
            className="field"
            placeholder="Task title"
            value={habitForm.title}
            onChange={(e) => setHabitForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Reminder HH:mm"
            value={habitForm.reminderTime}
            onChange={(e) =>
              setHabitForm((prev) => ({ ...prev, reminderTime: e.target.value }))
            }
          />
          <label className="inline-flex items-center gap-2 text-sm text-muted">
            <input
              checked={habitForm.required}
              onChange={(e) => setHabitForm((prev) => ({ ...prev, required: e.target.checked }))}
              type="checkbox"
            />
            Required task
          </label>
          <button className="btn" type="submit">
            Add habit
          </button>
        </form>
        <div className="mt-4 space-y-2">
          {habits.map((habit) => (
            <div
              key={habit.habit_id}
              className="flex items-center justify-between rounded-lg bg-canvas p-2 text-sm"
            >
              <span>{habit.title}</span>
              <button
                className="btn-mini"
                onClick={() => void checkHabit(habit.habit_id)}
                type="button"
              >
                Done
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="panel-block">
        <h2 className="font-display text-xl">Reminder Schedule</h2>
        <form className="mt-4 grid gap-2" onSubmit={handleReminderSubmit}>
          <input
            className="field"
            placeholder="Reminder title"
            value={reminderForm.title}
            onChange={(e) => setReminderForm((prev) => ({ ...prev, title: e.target.value }))}
          />
          <input
            className="field"
            placeholder="Time HH:mm"
            value={reminderForm.time}
            onChange={(e) => setReminderForm((prev) => ({ ...prev, time: e.target.value }))}
          />
          <button className="btn-secondary" type="submit">
            Save reminder
          </button>
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
  );
}
