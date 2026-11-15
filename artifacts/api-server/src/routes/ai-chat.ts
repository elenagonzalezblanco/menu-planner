import { Router, type IRouter } from "express";
import { generationOptions, getAzureOpenAIClient, MODEL } from "../lib/azure-openai";
import type { AuthenticatedRequest } from "../middlewares/auth";

const router: IRouter = Router();

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

    const client = await getAzureOpenAIClient();
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        ...(systemPrompt ? [{ role: "system" as const, content: systemPrompt }] : []),
        ...messages.map(m => ({ role: m.role as "user" | "assistant" | "system", content: m.content })),
      ],
      ...generationOptions({ temperature: 0.7, maxOutputTokens: 4096 }),
    }, { timeout: 200_000 });

    const text = completion.choices?.[0]?.message?.content ?? "";
    // The model that actually answered, to verify which deployment is live.
    res.json({ text, model: completion.model });
  } catch (err) {
    console.error("AI chat error:", err);
    res.status(500).json({ error: "Error al comunicar con Azure OpenAI" });
  }
});

export default router;
