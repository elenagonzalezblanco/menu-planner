import { AzureOpenAI } from "openai";

export const openai = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT || "https://planner.openai.azure.com",
  apiVersion: "2024-02-01",
});
