import OpenAI from "openai";

const BASE_URL =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://menuplanner3-resource.services.ai.azure.com/api/projects/menuplanner3/openai/v1";

const TENANT_ID = process.env.AZURE_TENANT_ID || "16b3c013-d300-468d-ac64-7eda0820b6d3";
const CLIENT_ID = process.env.AZURE_CLIENT_ID;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

export const MODEL = process.env.AZURE_OPENAI_MODEL || "gpt-4o";

// ── Entra ID token cache ──
let cachedToken: string | null = null;
let tokenExpiry = 0;

async function getEntraToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 60_000) {
    return cachedToken;
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error("AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are required for Entra ID auth");
  }

  const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    scope: "https://cognitiveservices.azure.com/.default",
  });

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Entra ID token error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = now + data.expires_in * 1000;
  return cachedToken!;
}

export async function getAzureOpenAIClient(): Promise<OpenAI> {
  const token = await getEntraToken();
  return new OpenAI({
    apiKey: token,
    baseURL: BASE_URL,
  });
}
