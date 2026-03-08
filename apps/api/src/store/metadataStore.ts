export interface UserMetadata {
  userId: string;
  googleSub: string;
  email: string;
  name: string;
  spreadsheetId: string | null;
  encryptedRefreshToken: string;
  timezone: string;
  settingsJson: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertUserInput {
  userId: string;
  googleSub: string;
  email: string;
  name: string;
  spreadsheetId?: string | null;
  encryptedRefreshToken: string;
  timezone?: string;
  settingsJson?: string;
}

export interface PushSubscriptionRecord {
  id?: number;
  userId: string;
  endpoint: string;
  subscriptionJson: string;
  createdAt?: string;
}

export interface MetadataStore {
  init(): Promise<void>;
  upsertUser(input: UpsertUserInput): Promise<UserMetadata>;
  updateSpreadsheetId(userId: string, spreadsheetId: string): Promise<void>;
  updateUserSettings(userId: string, settingsJson: string): Promise<void>;
  getUserByUserId(userId: string): Promise<UserMetadata | null>;
  getUserByGoogleSub(googleSub: string): Promise<UserMetadata | null>;
  listUsers(): Promise<UserMetadata[]>;
  savePushSubscription(record: PushSubscriptionRecord): Promise<void>;
  removePushSubscription(endpoint: string): Promise<void>;
  listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]>;
}
