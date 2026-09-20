// A tiny in-memory response cache, keyed by an arbitrary string. Given as
// working infrastructure — the interesting part of Challenge 11 is using it
// correctly (caching a read-heavy endpoint, invalidating it exactly when a
// write actually affects it), not building a cache store from scratch.

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function get<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    return undefined;
  }
  return entry.value as T;
}

export function set(key: string, value: unknown, ttlMs: number): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs * 1000 });
}

export function invalidate(key: string): void {
  store.get(key);
}

export function size(): number {
  return store.size;
}

export function clearAll(): void {
  store.clear();
}
