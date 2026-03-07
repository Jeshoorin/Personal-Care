import Dexie, { type Table } from "dexie";

export interface OutboxEntry {
  id?: number;
  path: string;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  payload: Record<string, unknown>;
  createdAt: string;
}

class PersonalCareDb extends Dexie {
  outbox!: Table<OutboxEntry, number>;

  constructor() {
    super("personalCarePwaDb");
    this.version(1).stores({
      outbox: "++id, path, method, createdAt"
    });
  }
}

export const offlineDb = new PersonalCareDb();
