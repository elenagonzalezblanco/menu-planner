export * from "./generated/api";
export * from "./generated/api.schemas";
export {
  setBaseUrl,
  setAuthTokenGetter,
  setUserIdGetter,
  setDefaultTimeout,
  TimeoutError,
} from "./custom-fetch";
export type { AuthTokenGetter } from "./custom-fetch";
