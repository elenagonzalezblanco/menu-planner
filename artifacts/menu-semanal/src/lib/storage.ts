// Core localStorage utilities with user namespacing.
// All keys are stored as `{userId}:{key}` to scope data per user.

export function storageGet<T>(userId: string, key: string): T | null {
  try {
    const item = localStorage.getItem(`${userId}:${key}`);
    if (item === null) return null;
    return JSON.parse(item) as T;
  } catch {
    return null;
  }
}

export function storageSet<T>(userId: string, key: string, value: T): void {
  try {
    localStorage.setItem(`${userId}:${key}`, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or unavailable — fail silently
  }
}

export function storageDelete(userId: string, key: string): void {
  localStorage.removeItem(`${userId}:${key}`);
}

export function generateId(): string {
  return crypto.randomUUID();
}
