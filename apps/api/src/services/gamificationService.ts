import { scoreFromEvents, updateStreak, type ScoreEvent, type StreakState } from "@personal-care/shared-types";
import { v4 as uuidv4 } from "uuid";
import type { UserMetadata } from "../store/metadataStore.js";
import { localDateInTimeZone } from "../lib/date.js";
import { SheetsService } from "./sheetsService.js";

type EventType =
  | "habit_completed"
  | "calorie_target_hit"
  | "water_target_hit"
  | "workout_completed"
  | "run_logged"
  | "weekly_metrics_logged";

export class GamificationService {
  constructor(private readonly sheetsService: SheetsService) {}

  async recordScoreEvent(user: UserMetadata, eventType: EventType): Promise<void> {
    const pointsByType: Record<EventType, number> = {
      habit_completed: 10,
      calorie_target_hit: 20,
      water_target_hit: 10,
      workout_completed: 30,
      run_logged: 30,
      weekly_metrics_logged: 40
    };
    await this.sheetsService.appendRow(user, "Scores", {
      event_id: uuidv4(),
      event_type: eventType,
      points: pointsByType[eventType]
    });
  }

  async getScoreboard(user: UserMetadata) {
    const rows = await this.sheetsService.listRows(user, "Scores");
    const events: ScoreEvent[] = rows.map((row) => ({
      id: row.event_id,
      date: row.local_date,
      type: row.event_type as ScoreEvent["type"]
    }));
    const summary = scoreFromEvents(events);
    return {
      points: summary.points,
      level: summary.level,
      totalEvents: events.length
    };
  }

  async getStreakState(user: UserMetadata): Promise<StreakState> {
    const rows = await this.sheetsService.listRows(user, "Streaks");
    const last = rows[rows.length - 1];
    if (!last) {
      return { current: 0, longest: 0 };
    }
    return {
      current: Number(last.current_streak ?? 0),
      longest: Number(last.longest_streak ?? 0),
      lastDate: last.local_date
    };
  }

  async recordDailyStreak(user: UserMetadata, metRequiredGoals: boolean): Promise<StreakState> {
    const state = await this.getStreakState(user);
    const today = localDateInTimeZone(user.timezone || "Asia/Kolkata");
    if (state.lastDate === today) {
      return state;
    }
    const updated = updateStreak(state, today, metRequiredGoals);
    await this.sheetsService.appendRow(user, "Streaks", {
      current_streak: updated.current,
      longest_streak: updated.longest,
      met_required_goals: metRequiredGoals
    });
    return updated;
  }
}
