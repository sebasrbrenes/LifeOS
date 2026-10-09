"use client";

import { SparklesIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import type { CoachInsight } from "@/lib/ai/coach";

import { deleteInsight, generateWeeklyInsight } from "../actions";

export type StoredInsight = {
  id: string;
  model: string;
  createdAt: string;
  content: CoachInsight;
  payload: unknown;
};

/**
 * AI analysis of a closed week. Generating is explicit, with a clear
 * statement of what is sent; the result says it is AI-written and shows
 * the exact data it was based on.
 */
export function CoachPanel({
  weekStart,
  configured,
  insight,
  remaining,
}: {
  weekStart: string;
  configured: boolean;
  insight: StoredInsight | null;
  remaining: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionState | null>(null);
  const run = (task: () => Promise<ActionState>) =>
    startTransition(async () => setResult(await task()));

  if (!configured && !insight)
    return (
      <p className="text-sm text-muted-foreground">
        El análisis con IA es opcional y no está configurado en este servidor
        (falta <span className="font-mono">ANTHROPIC_API_KEY</span>). Tu
        revisión no lo necesita.
      </p>
    );

  return (
    <div className="grid gap-4">
      {result?.message ? (
        <FormMessage status={result.status === "error" ? "error" : "success"}>
          {result.message}
        </FormMessage>
      ) : null}

      {insight ? (
        <article className="grid gap-3">
          <p className="text-sm">{insight.content.summary}</p>
          <div className="grid gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              Cuello de botella
            </h3>
            <p className="text-sm">{insight.content.bottleneck}</p>
          </div>
          <div className="grid gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              Foco para la próxima semana
            </h3>
            <p className="text-sm">{insight.content.focus}</p>
          </div>
          <div className="grid gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              Para reflexionar
            </h3>
            <ul className="grid list-disc gap-1 pl-5 text-sm">
              {insight.content.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Escrito por IA ({insight.model}) a partir solo de los datos de esta
            revisión; sus cifras se comprobaron contra ellos. Tus scores no
            vienen de la IA.
          </p>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Datos que se enviaron
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-muted p-3 font-mono text-[0.7rem] whitespace-pre-wrap">
              {JSON.stringify(insight.payload, null, 2)}
            </pre>
          </details>
          <Button
            type="button"
            variant="ghost"
            size="lg"
            className="h-11 justify-self-start text-destructive"
            disabled={pending}
            onClick={() => run(() => deleteInsight(insight.id))}
          >
            <Trash2Icon aria-hidden="true" />
            Borrar análisis
          </Button>
        </article>
      ) : null}

      {configured && remaining > 0 ? (
        <div className="grid gap-2 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Se enviará a Anthropic (Claude) el resumen de esta semana: scores,
            nombres de categorías y métricas, tus compromisos y tu objetivo
            principal. No se envían tu email ni tus notas.
          </p>
          <Button
            type="button"
            variant={insight ? "outline" : "default"}
            size="lg"
            className="h-11 justify-self-start"
            disabled={pending}
            aria-busy={pending}
            onClick={() => run(() => generateWeeklyInsight(weekStart))}
          >
            <SparklesIcon aria-hidden="true" />
            {pending
              ? "Analizando…"
              : insight
                ? "Generar otro análisis"
                : "Generar análisis con IA"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
