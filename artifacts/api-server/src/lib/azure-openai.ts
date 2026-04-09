import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";

const BASE_URL =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://menuplanner3-resource.services.ai.azure.com/api/projects/menuplanner3/openai/v1";

export const MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-4o";

// ── Entra ID token via DefaultAzureCredential ──
// On Azure Container Apps → uses Managed Identity (no secrets needed)
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

export async function getAzureOpenAIClient(): Promise<OpenAI> {
  const token = await getEntraToken();
  return new OpenAI({
    apiKey: token,
    baseURL: BASE_URL,
  });
}
