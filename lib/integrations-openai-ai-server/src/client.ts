import OpenAI from "openai";

const BASE_URL =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://menuplanner3-resource.services.ai.azure.com/api/projects/menuplanner3/openai/v1";

// This module is used by other libs; the API server uses its own
// azure-openai.ts with Entra ID auth instead.
export const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY || "placeholder",
  baseURL: BASE_URL,
});
