import OpenAI from "openai";
import { DefaultAzureCredential } from "@azure/identity";

// Direct Cognitive Services endpoint (NOT the AI Foundry project endpoint, which rejects Entra tokens)
const RESOURCE_ENDPOINT =
  process.env.AZURE_OPENAI_ENDPOINT ||
  "https://menuplanner3-resource.cognitiveservices.azure.com";

export const MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-4o";

const API_VERSION = "2024-10-21";

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

export async function getAzureOpenAIClient(): Promise<OpenAI> {
  const token = await getEntraToken();
  return new OpenAI({
    apiKey: token,
    baseURL: `${RESOURCE_ENDPOINT}/openai/deployments/${MODEL}`,
    defaultQuery: { "api-version": API_VERSION },
  });
}
