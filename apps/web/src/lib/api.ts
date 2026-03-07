import { offlineDb } from "./offlineDb";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";

function cacheKey(path: string) {
  return `pc-cache:${path}`;
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }
  if (response.status === 204) {
    return {} as T;
  }
  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    const data = await request<T>(path, { method: "GET" });
    localStorage.setItem(cacheKey(path), JSON.stringify(data));
    return data;
  } catch (error) {
    const fallback = localStorage.getItem(cacheKey(path));
    if (fallback) {
      return JSON.parse(fallback) as T;
    }
    throw error;
  }
}

export async function apiPost<T>(
  path: string,
  payload: Record<string, unknown>
): Promise<T | { queued: true }> {
  if (!navigator.onLine) {
    await offlineDb.outbox.add({
      path,
      method: "POST",
      payload,
      createdAt: new Date().toISOString()
    });
    return { queued: true };
  }

  try {
    return await request<T>(path, {
      method: "POST",
      body: JSON.stringify(payload)
    });
  } catch {
    await offlineDb.outbox.add({
      path,
      method: "POST",
      payload,
      createdAt: new Date().toISOString()
    });
    return { queued: true };
  }
}

export async function syncOutbox(): Promise<number> {
  if (!navigator.onLine) return 0;
  const rows = await offlineDb.outbox.orderBy("id").toArray();
  let synced = 0;
  for (const row of rows) {
    try {
      await request(row.path, {
        method: row.method,
        body: JSON.stringify(row.payload)
      });
      if (row.id) {
        await offlineDb.outbox.delete(row.id);
      }
      synced += 1;
    } catch {
      break;
    }
  }
  return synced;
}

export { API_BASE_URL };
