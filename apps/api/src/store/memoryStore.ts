import type {
  MetadataStore,
  PushSubscriptionRecord,
  UpsertUserInput,
  UserMetadata
} from "./metadataStore.js";

export class MemoryStore implements MetadataStore {
  private readonly users = new Map<string, UserMetadata>();
  private readonly userByGoogleSub = new Map<string, string>();
  private readonly subscriptions = new Map<string, PushSubscriptionRecord[]>();

  async init(): Promise<void> {}

  async upsertUser(input: UpsertUserInput): Promise<UserMetadata> {
    const existing = this.users.get(input.userId);
    const now = new Date().toISOString();
    const user: UserMetadata = {
      userId: input.userId,
      googleSub: input.googleSub,
      email: input.email,
      name: input.name,
      spreadsheetId: input.spreadsheetId ?? existing?.spreadsheetId ?? null,
      encryptedRefreshToken: input.encryptedRefreshToken,
      timezone: input.timezone ?? existing?.timezone ?? "Asia/Kolkata",
      settingsJson: input.settingsJson ?? existing?.settingsJson ?? "{}",
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.users.set(input.userId, user);
    this.userByGoogleSub.set(input.googleSub, input.userId);
    return user;
  }

  async updateSpreadsheetId(userId: string, spreadsheetId: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, spreadsheetId, updatedAt: new Date().toISOString() });
  }

  async updateUserSettings(userId: string, settingsJson: string): Promise<void> {
    const user = this.users.get(userId);
    if (!user) return;
    this.users.set(userId, { ...user, settingsJson, updatedAt: new Date().toISOString() });
  }

  async getUserByUserId(userId: string): Promise<UserMetadata | null> {
    return this.users.get(userId) ?? null;
  }

  async getUserByGoogleSub(googleSub: string): Promise<UserMetadata | null> {
    const userId = this.userByGoogleSub.get(googleSub);
    if (!userId) return null;
    return this.users.get(userId) ?? null;
  }

  async listUsers(): Promise<UserMetadata[]> {
    return [...this.users.values()];
  }

  async savePushSubscription(record: PushSubscriptionRecord): Promise<void> {
    const existing = this.subscriptions.get(record.userId) ?? [];
    const deduped = existing.filter((item) => item.endpoint !== record.endpoint);
    deduped.push({
      ...record,
      createdAt: new Date().toISOString()
    });
    this.subscriptions.set(record.userId, deduped);
  }

  async removePushSubscription(endpoint: string): Promise<void> {
    for (const [userId, records] of this.subscriptions.entries()) {
      this.subscriptions.set(
        userId,
        records.filter((item) => item.endpoint !== endpoint)
      );
    }
  }

  async listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
    return this.subscriptions.get(userId) ?? [];
  }
}
