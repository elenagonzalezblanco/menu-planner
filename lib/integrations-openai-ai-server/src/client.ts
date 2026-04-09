import OpenAI from "openai";

const BASE_URL =
  process.env.AZURE_OPENAI_BASE_URL ||
  "https://menuplanner3-resource.services.ai.azure.com/api/projects/menuplanner3/openai/v1";

export const openai = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  baseURL: BASE_URL,
});
