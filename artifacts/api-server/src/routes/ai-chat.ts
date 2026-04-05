import { Router, type IRouter } from "express";
import { DefaultAzureCredential } from "@azure/identity";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

const AZURE_OPENAI_ENDPOINT =
  process.env.AZURE_OPENAI_ENDPOINT || "https://planner.openai.azure.com";
const AZURE_OPENAI_DEPLOYMENT =
  process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o-mini";
const API_VERSION = "2024-02-01";

let credential: DefaultAzureCredential | null = null;

function getCredential() {
  if (!credential) credential = new DefaultAzureCredential();
  return credential;
}

async function getToken(): Promise<string> {
  const cred = getCredential();
  const tokenResponse = await cred.getToken(
    "https://cognitiveservices.azure.com/.default"
  );
  return tokenResponse.token;
}

router.post("/ai/chat", async (req: AuthenticatedRequest, res) => {
  try {
    const { messages, systemPrompt } = req.body as {
      messages: { role: string; content: string }[];
      systemPrompt?: string;
    };

    if (!messages || !Array.isArray(messages)) {
      res.status(400).json({ error: "messages array required" });
      return;
    }

    const token = await getToken();
    const base = AZURE_OPENAI_ENDPOINT.replace(/\/$/, "");
    const url = `${base}/openai/deployments/${AZURE_OPENAI_DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

    const body = {
      messages: [
        ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
        ...messages,
      ],
      temperature: 0.7,
      max_tokens: 4096,
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Azure OpenAI error:", response.status, errText);
      res
        .status(response.status)
        .json({ error: `Azure OpenAI error: ${errText.slice(0, 300)}` });
      return;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content ?? "";
    res.json({ text });
  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({ error: "Error al comunicar con Azure OpenAI" });
  }
});

export default router;
