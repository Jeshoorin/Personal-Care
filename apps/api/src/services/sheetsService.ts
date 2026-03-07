import { BASE_RECORD_FIELDS, SHEET_TABS } from "@personal-care/shared-types";
import { google, sheets_v4 } from "googleapis";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";
import { decryptText } from "../lib/crypto.js";
import { nowIso } from "../lib/date.js";
import type { UserMetadata } from "../store/metadataStore.js";
import { createOAuthClientWithRefreshToken } from "./googleOAuth.js";

type TabName = (typeof SHEET_TABS)[number];

const TAB_HEADERS: Record<TabName, string[]> = {
  Profile: [...BASE_RECORD_FIELDS, "email", "name", "timezone", "avatar_url"],
  Goals: [
    ...BASE_RECORD_FIELDS,
    "mode",
    "type",
    "current_weight_kg",
    "target_weight_kg",
    "target_date",
    "weekly_rate_kg",
    "activity_multiplier",
    "age",
    "sex",
    "height_cm"
  ],
  FoodLog: [...BASE_RECORD_FIELDS, "name", "calories", "quantity", "source", "meal_type"],
  WaterLog: [...BASE_RECORD_FIELDS, "amount_ml"],
  WeightLog: [...BASE_RECORD_FIELDS, "weight_kg"],
  RunLog: [...BASE_RECORD_FIELDS, "run_id", "distance_km", "duration_sec", "notes"],
  RunLaps: [...BASE_RECORD_FIELDS, "lap_id", "run_id", "lap_number", "lap_distance_km", "lap_duration_sec"],
  WorkoutPlans: [...BASE_RECORD_FIELDS, "workout_id", "title", "level", "focus", "week_index", "target_sessions"],
  WorkoutSessions: [...BASE_RECORD_FIELDS, "session_id", "workout_id", "duration_min", "completed", "intensity"],
  BodyMetrics: [
    ...BASE_RECORD_FIELDS,
    "weight_kg",
    "waist_cm",
    "chest_cm",
    "hip_cm",
    "thigh_cm",
    "arm_cm"
  ],
  Habits: [...BASE_RECORD_FIELDS, "habit_id", "title", "required", "reminder_time", "category"],
  HabitCompletions: [...BASE_RECORD_FIELDS, "habit_id", "completed", "completed_at"],
  Reminders: [...BASE_RECORD_FIELDS, "reminder_id", "title", "time", "enabled", "type"],
  Scores: [...BASE_RECORD_FIELDS, "event_id", "event_type", "points"],
  Streaks: [...BASE_RECORD_FIELDS, "current_streak", "longest_streak", "met_required_goals"],
  Audit: [...BASE_RECORD_FIELDS, "action", "payload_json"]
};

async function safeGetValues(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  range: string
) {
  const response = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  return response.data.values ?? [];
}

export class SheetsService {
  async ensureSpreadsheetForUser(
    user: UserMetadata,
    refreshToken: string
  ): Promise<string> {
    const auth = createOAuthClientWithRefreshToken(refreshToken);
    const sheets = google.sheets({ version: "v4", auth });

    if (user.spreadsheetId) {
      try {
        await sheets.spreadsheets.get({ spreadsheetId: user.spreadsheetId });
        await this.ensureTabsAndHeaders(sheets, user.spreadsheetId);
        return user.spreadsheetId;
      } catch {
        // Recreate when the previous spreadsheet ID is invalid.
      }
    }

    const created = await sheets.spreadsheets.create({
      requestBody: {
        properties: { title: `Personal Care - ${user.name}` }
      }
    });
    const spreadsheetId = created.data.spreadsheetId;
    if (!spreadsheetId) {
      throw new Error("Google Sheets API did not return a spreadsheet ID.");
    }
    await this.ensureTabsAndHeaders(sheets, spreadsheetId);
    return spreadsheetId;
  }

  private async ensureTabsAndHeaders(
    sheets: sheets_v4.Sheets,
    spreadsheetId: string
  ): Promise<void> {
    const metadata = await sheets.spreadsheets.get({ spreadsheetId });
    const existing = new Set(
      (metadata.data.sheets ?? [])
        .map((sheet) => sheet.properties?.title)
        .filter((title): title is string => Boolean(title))
    );

    const missingTabs = SHEET_TABS.filter((tab) => !existing.has(tab));
    if (missingTabs.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: missingTabs.map((tab) => ({
            addSheet: { properties: { title: tab } }
          }))
        }
      });
    }

    for (const tab of SHEET_TABS) {
      const headerRange = `${tab}!1:1`;
      const currentHeaderRow = await safeGetValues(sheets, spreadsheetId, headerRange);
      if (currentHeaderRow.length === 0 || currentHeaderRow[0].length === 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `${tab}!A1`,
          valueInputOption: "RAW",
          requestBody: {
            values: [TAB_HEADERS[tab]]
          }
        });
      }
    }
  }

  private async getSheetsClientForUser(user: UserMetadata) {
    const refreshToken = decryptText(user.encryptedRefreshToken, env.ENCRYPTION_KEY);
    const auth = createOAuthClientWithRefreshToken(refreshToken);
    return google.sheets({ version: "v4", auth });
  }

  async listRows(
    user: UserMetadata,
    tab: TabName
  ): Promise<Record<string, string>[]> {
    if (!user.spreadsheetId) {
      return [];
    }
    const sheets = await this.getSheetsClientForUser(user);
    const values = await safeGetValues(sheets, user.spreadsheetId, `${tab}!A1:ZZ10000`);
    if (values.length === 0) return [];

    const [header, ...rows] = values;
    return rows.map((row) => {
      const obj: Record<string, string> = {};
      header.forEach((column, index) => {
        obj[column] = row[index] ?? "";
      });
      return obj;
    });
  }

  async appendRow(
    user: UserMetadata,
    tab: TabName,
    record: Record<string, string | number | boolean | undefined>
  ): Promise<void> {
    if (!user.spreadsheetId) {
      throw new Error("User spreadsheet has not been initialized.");
    }
    const sheets = await this.getSheetsClientForUser(user);
    const headers = TAB_HEADERS[tab];

    const now = nowIso();
    const defaultRecord: Record<string, string | number | boolean> = {
      entry_id: record.entry_id ? String(record.entry_id) : uuidv4(),
      user_id: user.userId,
      local_date: record.local_date ? String(record.local_date) : now.slice(0, 10),
      created_at: now,
      updated_at: now
    };

    const finalRecord = {
      ...defaultRecord,
      ...record
    };

    const row = headers.map((header) =>
      finalRecord[header] === undefined ? "" : String(finalRecord[header])
    );

    await sheets.spreadsheets.values.append({
      spreadsheetId: user.spreadsheetId,
      range: `${tab}!A1`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [row]
      }
    });
  }
}
