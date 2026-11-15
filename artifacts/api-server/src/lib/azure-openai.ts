import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";

// Direct Azure OpenAI endpoint (NOT the AI Foundry project endpoint, which rejects Entra tokens)
const RESOURCE_ENDPOINT = (
  process.env.AZURE_OPENAI_ENDPOINT ||
  "https://menuplanner3-resource.openai.azure.com"
).replace(/\/+$/, "");

/** Deployment name (deployments are named after their model). */
export const MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-6.1-sol";

type Effort = Exclude<OpenAI.ReasoningEffort, null>;
const EFFORTS: readonly Effort[] = ["none", "minimal", "low", "medium", "high", "xhigh"];

/** Room for the model's thinking, which counts towards max_completion_tokens. */
const REASONING_BUDGET_TOKENS = 24_000;

export interface GenerationSettings {
  /** Used only by classic models; reasoning models reject sampling parameters. */
  temperature: number;
  /** Visible answer size. */
  maxOutputTokens: number;
}

/**
 * Request options that work for classic deployments (gpt-4o) and for reasoning
 * deployments (o-series, GPT-5 and later), which reject `temperature` and need
 * a completion budget that includes their reasoning tokens.
 */
export function generationOptionsFor(
  model: string,
  settings: GenerationSettings,
  env: Record<string, string | undefined> = process.env,
): { temperature?: number; max_completion_tokens: number; reasoning_effort?: Effort } {
  const reasoning = env.AZURE_OPENAI_REASONING
    ? env.AZURE_OPENAI_REASONING === "true"
    : /^(o\d|gpt-([5-9]|\d{2,}))/i.test(model);
  if (!reasoning) return { temperature: settings.temperature, max_completion_tokens: settings.maxOutputTokens };
  const effort = EFFORTS.find(value => value === env.AZURE_OPENAI_REASONING_EFFORT) ?? "medium";
  return { reasoning_effort: effort, max_completion_tokens: settings.maxOutputTokens + REASONING_BUDGET_TOKENS };
}

export const generationOptions = (settings: GenerationSettings) => generationOptionsFor(MODEL, settings);

// ── Entra ID token via DefaultAzureCredential ──
// On Azure App Service / Container Apps → uses Managed Identity (no secrets needed)
// Locally → uses az cli login, VS Code, env vars, etc.
const credential = new DefaultAzureCredential();
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getEntraToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken;
  }

  const tokenResponse = await credential.getToken(
    "https://cognitiveservices.azure.com/.default"
  );
  cachedToken = tokenResponse.token;
  tokenExpiry = tokenResponse.expiresOnTimestamp;
  return cachedToken;
}

/** Azure OpenAI v1 API: supports current models without dated api-versions; `model` is the deployment name. */
export async function getAzureOpenAIClient(): Promise<OpenAI> {
  const token = await getEntraToken();
  return new OpenAI({
    apiKey: token,
    baseURL: `${RESOURCE_ENDPOINT}/openai/v1/`,
  });
}
