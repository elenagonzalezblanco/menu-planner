import { test } from "node:test";
import assert from "node:assert/strict";
import { generationOptionsFor } from "./azure-openai";

const settings = { temperature: 0.7, maxOutputTokens: 4096 };

test("classic deployments keep temperature and the visible answer budget", () => {
  assert.deepEqual(generationOptionsFor("gpt-4o", settings, {}), { temperature: 0.7, max_completion_tokens: 4096 });
});

test("reasoning deployments drop temperature and reserve room for thinking", () => {
  for (const model of ["gpt-6.1-sol", "gpt-6-astra", "gpt-5.4", "o3", "GPT-6.1-Terra"]) {
    assert.deepEqual(generationOptionsFor(model, settings, {}), { reasoning_effort: "medium", max_completion_tokens: 28_096 }, model);
  }
});

test("effort and reasoning detection can be configured", () => {
  assert.equal(generationOptionsFor("gpt-6.1-sol", settings, { AZURE_OPENAI_REASONING_EFFORT: "high" }).reasoning_effort, "high");
  assert.equal(generationOptionsFor("gpt-6.1-sol", settings, { AZURE_OPENAI_REASONING_EFFORT: "max" }).reasoning_effort, "medium");
  assert.equal(generationOptionsFor("my-deployment", settings, { AZURE_OPENAI_REASONING: "true" }).reasoning_effort, "medium");
  assert.equal(generationOptionsFor("gpt-6.1-sol", settings, { AZURE_OPENAI_REASONING: "false" }).temperature, 0.7);
});
