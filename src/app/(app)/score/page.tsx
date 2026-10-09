import type { Metadata } from "next";
import { Suspense } from "react";

import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { ScoreBreakdown } from "@/features/scores/components/score-breakdown";
import { IssueList } from "@/features/scores/components/issue-list";
import { ScoreRing } from "@/features/scores/components/score-visuals";
import { loadScoringOverview } from "@/features/scores/data";
import { formatLocalDate, formatNumber, formatShare } from "@/lib/format";
import { localDate } from "@/lib/scoring";

export const metadata: Metadata = { title: "Score" };

export default function ScorePage() {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          ¿Por qué este score?
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada punto de tu Life Score, de dónde sale y cuánto pesa.
        </p>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-96 rounded-2xl bg-card" />
        }
      >
        <ScoreContent />
      </Suspense>
    </div>
  );
}

async function ScoreContent() {
  const { life, metrics, categories, scoreVersion, profile } =
    await loadScoringOverview();
  const disabled = categories
    .filter((c) => !c.enabled)
    .map((c) => c.name)
    .join(", ");

  return (
    <div className="grid gap-4">
      <Panel title="Cómo se calcula">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <ScoreRing
            score={life.score}
            rank={life.rank}
            label="Life Score"
            size={140}
          />
          <div className="grid gap-2 text-sm">
            <p>
              <span className="font-mono">
                Life Score = Σ (score de categoría × peso)
              </span>
              , y cada categoría = Σ (score de métrica × peso).
            </p>
            <p className="text-muted-foreground">
              Las métricas sin datos{" "}
              <strong className="text-foreground">no cuentan como 0</strong>: su
              peso se reparte entre las que tienen datos. Por eso la completitud
              ({formatShare(life.completeness)}) se muestra aparte, igual que la
              confianza ({formatShare(life.confidence)}).
            </p>
            <p className="text-xs text-muted-foreground">
              {life.score === null
                ? "Sin datos suficientes para calcular."
                : `Valor exacto: ${formatNumber(life.score, 2)}. Se muestra truncado para no redondear hacia un rango no alcanzado.`}{" "}
              Calculado el{" "}
              {formatLocalDate(localDate(life.asOf, profile.timezone))} (
              {profile.timezone})
              {scoreVersion ? ` con scoring v${scoreVersion.version}` : ""}.
            </p>
          </div>
        </div>
        <IssueList issues={life.issues} className="mt-4" />
      </Panel>

      <ScoreBreakdown life={life} metrics={metrics} />

      {disabled ? (
        <p className="text-sm text-muted-foreground">
          Categorías desactivadas (no cuentan): {disabled}.
        </p>
      ) : null}
    </div>
  );
}
