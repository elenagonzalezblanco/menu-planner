import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

setBaseUrl(API_URL);

// Set up auth: sends X-User-Id header (handled in custom-fetch via userId)
// The userId is managed by the UserContext and sent per-request below
let _currentUserId: number | null = null;

export function setApiUserId(userId: number | null) {
  _currentUserId = userId;
}

export function getApiUserId(): number | null {
  return _currentUserId;
}

// We don't use bearer tokens for now — we use X-User-Id header.
// The custom-fetch needs to be patched to send this header.
// For now, we'll add it via a request interceptor pattern.
