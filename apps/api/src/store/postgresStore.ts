import { Pool } from "pg";
import type {
  MetadataStore,
  PushSubscriptionRecord,
  UpsertUserInput,
  UserMetadata
} from "./metadataStore.js";

const INIT_SQL = `
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  spreadsheet_id TEXT,
  encrypted_refresh_token TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  endpoint TEXT UNIQUE NOT NULL,
  subscription_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`;

export class PostgresStore implements MetadataStore {
  private readonly pool: Pool;

  constructor(databaseUrl: string) {
    this.pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  }

  async init(): Promise<void> {
    await this.pool.query(INIT_SQL);
  }

  async upsertUser(input: UpsertUserInput): Promise<UserMetadata> {
    const result = await this.pool.query<UserMetadata>(
      `
      INSERT INTO users (
        user_id, google_sub, email, name, spreadsheet_id, encrypted_refresh_token, timezone, settings_json
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (user_id)
      DO UPDATE SET
        google_sub = EXCLUDED.google_sub,
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        spreadsheet_id = COALESCE(EXCLUDED.spreadsheet_id, users.spreadsheet_id),
        encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
        timezone = COALESCE(EXCLUDED.timezone, users.timezone),
        settings_json = COALESCE(EXCLUDED.settings_json, users.settings_json),
        updated_at = NOW()
      RETURNING
        user_id AS "userId",
        google_sub AS "googleSub",
        email,
        name,
        spreadsheet_id AS "spreadsheetId",
        encrypted_refresh_token AS "encryptedRefreshToken",
        timezone,
        settings_json AS "settingsJson",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
      `,
      [
        input.userId,
        input.googleSub,
        input.email,
        input.name,
        input.spreadsheetId ?? null,
        input.encryptedRefreshToken,
        input.timezone ?? "Asia/Kolkata",
        input.settingsJson ?? "{}"
      ]
    );
    return result.rows[0];
  }

  async updateSpreadsheetId(userId: string, spreadsheetId: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET spreadsheet_id = $2, updated_at = NOW() WHERE user_id = $1",
      [userId, spreadsheetId]
    );
  }

  async updateUserSettings(userId: string, settingsJson: string): Promise<void> {
    await this.pool.query(
      "UPDATE users SET settings_json = $2, updated_at = NOW() WHERE user_id = $1",
      [userId, settingsJson]
    );
  }

  async getUserByUserId(userId: string): Promise<UserMetadata | null> {
    const result = await this.pool.query<UserMetadata>(
      `
      SELECT
        user_id AS "userId",
        google_sub AS "googleSub",
        email,
        name,
        spreadsheet_id AS "spreadsheetId",
        encrypted_refresh_token AS "encryptedRefreshToken",
        timezone,
        settings_json AS "settingsJson",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
      FROM users WHERE user_id = $1
      `,
      [userId]
    );
    return result.rows[0] ?? null;
  }

  async getUserByGoogleSub(googleSub: string): Promise<UserMetadata | null> {
    const result = await this.pool.query<UserMetadata>(
      `
      SELECT
        user_id AS "userId",
        google_sub AS "googleSub",
        email,
        name,
        spreadsheet_id AS "spreadsheetId",
        encrypted_refresh_token AS "encryptedRefreshToken",
        timezone,
        settings_json AS "settingsJson",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
      FROM users WHERE google_sub = $1
      `,
      [googleSub]
    );
    return result.rows[0] ?? null;
  }

  async listUsers(): Promise<UserMetadata[]> {
    const result = await this.pool.query<UserMetadata>(
      `
      SELECT
        user_id AS "userId",
        google_sub AS "googleSub",
        email,
        name,
        spreadsheet_id AS "spreadsheetId",
        encrypted_refresh_token AS "encryptedRefreshToken",
        timezone,
        settings_json AS "settingsJson",
        created_at::text AS "createdAt",
        updated_at::text AS "updatedAt"
      FROM users
      ORDER BY created_at ASC
      `
    );
    return result.rows;
  }

  async savePushSubscription(record: PushSubscriptionRecord): Promise<void> {
    await this.pool.query(
      `
      INSERT INTO push_subscriptions (user_id, endpoint, subscription_json)
      VALUES ($1, $2, $3)
      ON CONFLICT (endpoint)
      DO UPDATE SET user_id = EXCLUDED.user_id, subscription_json = EXCLUDED.subscription_json
      `,
      [record.userId, record.endpoint, record.subscriptionJson]
    );
  }

  async removePushSubscription(endpoint: string): Promise<void> {
    await this.pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
  }

  async listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    const result = await this.pool.query<PushSubscriptionRecord>(
      `
      SELECT id, user_id AS "userId", endpoint, subscription_json AS "subscriptionJson", created_at::text AS "createdAt"
      FROM push_subscriptions
      WHERE user_id = $1
      ORDER BY created_at DESC
      `,
      [userId]
    );
    return result.rows;
  }
}
