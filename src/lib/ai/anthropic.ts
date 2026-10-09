import { z } from "zod";

import {
  COACH_SYSTEM_PROMPT,
  COACH_TOOL,
  coachInsightSchema,
  type CoachInsight,
} from "./coach";

/**
 * Minimal Claude Messages API client for the coach: one forced tool call
 * returning structured JSON. Injectable fetch for tests; errors carry a
 * code, never the response body or the key.
 */

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_AI_MODEL = "claude-sonnet-5-5";

export class AiError extends Error {
  constructor(
    readonly code:
      "unauthorized" | "rate_limited" | "unavailable" | "bad_response",
  ) {
    super(`ai: ${code}`);
    this.name = "AiError";
  }
}

const responseSchema = z.object({
  content: z.array(
    z.object({
      type: z.string(),
      name: z.string().optional(),
      input: z.unknown().optional(),
    }),
  ),
});

export async function requestCoachInsight(
  fetchImpl: typeof fetch,
  {
    apiKey,
    model,
    payload,
  }: { apiKey: string; model: string; payload: unknown },
): Promise<CoachInsight> {
  const response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: COACH_SYSTEM_PROMPT,
      tools: [COACH_TOOL],
      tool_choice: { type: "tool", name: COACH_TOOL.name },
      messages: [
        {
          role: "user",
          content: `Datos de la revisión semanal (JSON):\n${JSON.stringify(payload)}`,
        },
      ],
    }),
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403)
    throw new AiError("unauthorized");
  if (response.status === 429) throw new AiError("rate_limited");
  if (!response.ok)
    throw new AiError(response.status >= 500 ? "unavailable" : "bad_response");

  const body = responseSchema.safeParse(await response.json());
  const call = body.success
    ? body.data.content.find(
        (block) => block.type === "tool_use" && block.name === COACH_TOOL.name,
      )
    : undefined;
  const insight = coachInsightSchema.safeParse(call?.input);
  if (!insight.success) throw new AiError("bad_response");
  return insight.data;
}
