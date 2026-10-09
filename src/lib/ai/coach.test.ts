import { describe, expect, it, vi } from "vitest";

import {
  buildWeeklyReview,
  computeLifeScore,
  computeWeekScore,
} from "@/lib/scoring";

import { AiError, requestCoachInsight } from "./anthropic";
import {
  buildCoachPayload,
  findUnsupportedNumbers,
  type CoachInsight,
} from "./coach";

const asOf = new Date("2026-10-04T23:00:00Z");
const life = (value: number) =>
  computeLifeScore({
    categories: [
      { id: "c1", key: "body", name: "Body", weight: 100, enabled: true },
    ],
    metrics: [
      {
        id: "m1",
        key: "km",
        name: "Km corriendo",
        categoryId: "c1",
        direction: "higher_is_better",
        period: "all_time",
        aggregation: "latest",
        weight: 1,
        enabled: true,
        sourcePreference: "manual",
        config: { target: 20 },
      },
    ],
    events: [
      {
        id: "e",
        metricDefinitionId: "m1",
        occurredAt: new Date("2026-09-30T10:00:00Z"),
        value,
        source: "manual",
      },
    ],
    context: { asOf, timeZone: "UTC" },
  });

const summary = buildWeeklyReview({
  lifeStart: life(10),
  lifeEnd: life(11.25),
  week: computeWeekScore([
    {
      id: "k",
      title: "Correr 3 veces",
      targetValue: 3,
      actualValue: 2,
      weight: 1,
      completionType: "quantity",
      status: "active",
    },
  ]),
});

const payload = buildCoachPayload({
  weekStart: "2026-09-28",
  weekEnd: "2026-10-04",
  mainGoal: "Correr un 10K en 50 min",
  summary,
  commitments: [
    {
      title: "Correr 3 veces",
      target: 3,
      done: 2,
      completed: false,
      cancelled: false,
    },
  ],
  alerts: [],
});

describe("buildCoachPayload", () => {
  it("sends structured values, rounded, and nothing else", () => {
    expect(payload).toMatchObject({
      week: { start: "2026-09-28", end: "2026-10-04" },
      mainGoal: "Correr un 10K en 50 min",
      lifeScore: { start: 50, end: 56.3, change: 6.3 },
      weekScore: 66.7,
      commitmentCompletion: { completed: 0, total: 1, ratePercent: 0 },
      bottleneck: { metric: "Km corriendo", score: 56.3 },
    });
    expect(JSON.stringify(payload)).not.toMatch(/user_?id|email|notes/i);
  });
});

const insight = (text: string): CoachInsight => ({
  summary: text,
  bottleneck: "Km corriendo sigue lejos del objetivo.",
  focus: "Completa las 3 salidas.",
  questions: ["¿Qué te impidió la tercera salida?"],
});

describe("findUnsupportedNumbers", () => {
  it("accepts numbers that come from the data, in prose forms", () => {
    expect(
      findUnsupportedNumbers(
        insight(
          "Tu Life Score subió de 50 a 56,3 (+6,3) y tu Week Score fue 66,7; redondeando, 67. Hiciste 2 de 3 salidas hacia tu 10K en 50 min.",
        ),
        payload,
      ),
    ).toEqual([]);
  });

  it("flags invented measurements", () => {
    expect(
      findUnsupportedNumbers(
        insight("Dormiste 6,5 horas de media y tu Life Score es 72."),
        payload,
      ),
    ).toEqual([6.5, 72]);
  });
});

describe("requestCoachInsight", () => {
  const reply = (input: unknown) =>
    new Response(
      JSON.stringify({
        content: [{ type: "tool_use", name: "weekly_coach", input }],
      }),
      { status: 200 },
    );

  it("forces the structured tool and parses its input", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(reply(insight("Semana sólida.")));
    const result = await requestCoachInsight(fetchImpl, {
      apiKey: "sk-test",
      model: "claude-sonnet-5-5",
      payload,
    });
    expect(result.summary).toBe("Semana sólida.");
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.tool_choice).toEqual({ type: "tool", name: "weekly_coach" });
    expect(body.model).toBe("claude-sonnet-5-5");
    expect((init?.headers as Record<string, string>)["x-api-key"]).toBe(
      "sk-test",
    );
  });

  it("rejects malformed output and maps HTTP errors", async () => {
    await expect(
      requestCoachInsight(
        vi.fn<typeof fetch>().mockResolvedValue(reply({ summary: "" })),
        {
          apiKey: "k",
          model: "m",
          payload,
        },
      ),
    ).rejects.toEqual(new AiError("bad_response"));
    await expect(
      requestCoachInsight(
        vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response("nope", { status: 401 })),
        { apiKey: "k", model: "m", payload },
      ),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });
});
