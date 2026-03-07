import { env } from "../config/env.js";
import { MemoryStore } from "./memoryStore.js";
import type { MetadataStore } from "./metadataStore.js";
import { PostgresStore } from "./postgresStore.js";

let singleton: MetadataStore | null = null;

export async function getMetadataStore(): Promise<MetadataStore> {
  if (singleton) return singleton;
  singleton = env.DATABASE_URL ? new PostgresStore(env.DATABASE_URL) : new MemoryStore();
  await singleton.init();
  return singleton;
}
