import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CompassIcon,
  TargetIcon,
} from "lucide-react";

import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { ScoreNumber } from "@/features/scores/components/score-visuals";
import { formatDelta, formatShare } from "@/lib/format";
import {
  HIGH_EXECUTION_SCORE,
  displayScore,
  type CategoryChange,
  type WeeklyReviewSummary,
} from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { focusCopy } from "../review-copy";

function Delta({
  value,
  className,
}: {
  value: number | null;
  className?: string;
}) {
  if (value === null)
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value > 0 && "text-primary",
        value < 0 && "text-destructive",
        className,
      )}
    >
      {formatDelta(value)}
    </span>
  );
}

function Highlight({
  label,
  change,
  showDelta,
}: {
  label: string;
  change: CategoryChange | null;
  showDelta: boolean;
}) {
  return (
    <div className="grid gap-1 rounded-xl border p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline justify-between gap-2">
        <span className="truncate font-medium">{change?.name ?? "—"}</span>
        {change ? (
          showDelta ? (
            <Delta value={change.delta} className="text-sm" />
          ) : (
            <ScoreNumber score={change.end} className="text-sm" />
          )
        ) : null}
      </dd>
    </div>
  );
}

/** The stored (or previewed) weekly review, section by section (spec §7.3). */
export function ReviewSummary({
  summary,
  scoreVersion,
}: {
  summary: WeeklyReviewSummary;
  scoreVersion: number | null;
}) {
  const { lifeScore, execution } = summary;
  const hasLifeData = lifeScore.start !== null || lifeScore.end !== null;
  const hasCategoryData = summary.categories.some((c) => c.end !== null);
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Panel title="Life Score · estado">
          <div className="grid gap-2">
            {hasLifeData ? (
              <p className="flex items-baseline gap-3">
                <ScoreNumber score={lifeScore.start} className="text-2xl" />
                <span aria-hidden="true" className="text-muted-foreground">
                  →
                </span>
                <span className="sr-only">a</span>
                <ScoreNumber
                  score={lifeScore.end}
                  className="text-4xl font-semibold"
                />
                <Delta value={lifeScore.delta} className="text-lg" />
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sin datos de métricas en esta semana: no hay estado que
                comparar.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Al empezar y al terminar la semana, con la misma versión de
              scoring{scoreVersion ? ` (v${scoreVersion})` : ""}.
            </p>
          </div>
        </Panel>
        <Panel title="Week Score · ejecución">
          <div className="grid gap-2">
            <p className="flex items-baseline gap-3">
              <ScoreNumber
                score={summary.weekScore}
                className="text-4xl font-semibold"
              />
              {summary.weekScore !== null ? (
                <span className="text-sm text-muted-foreground">/ 100</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {execution.total > 0
                ? `${execution.completed} de ${execution.total} compromisos completados (${formatShare(execution.rate ?? 0)}).`
                : "Sin compromisos esta semana."}
            </p>
          </div>
        </Panel>
      </div>

      <Panel title="Siguiente foco">
        <p className="flex items-start gap-3">
          <CompassIcon
            aria-hidden="true"
            className="mt-0.5 size-5 shrink-0 text-primary"
          />
          <span>{focusCopy(summary.focus)}</span>
        </p>
      </Panel>

      <Panel title="Categorías">
        {hasCategoryData ? (
          <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Highlight
              label="Mayor subida"
              change={summary.biggestGain}
              showDelta
            />
            <Highlight
              label="Mayor caída"
              change={summary.biggestDecline}
              showDelta
            />
            <Highlight
              label="Más fuerte"
              change={summary.strongest}
              showDelta={false}
            />
            <Highlight
              label="Más débil"
              change={summary.weakest}
              showDelta={false}
            />
          </dl>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            Ninguna categoría tuvo datos esta semana.
          </p>
        )}
        <table className="w-full text-sm">
          <caption className="sr-only">
            Score de cada categoría al empezar y al terminar la semana
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 font-normal">
                Categoría
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Inicio
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Fin
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                Cambio
              </th>
            </tr>
          </thead>
          <tbody>
            {summary.categories.map((category) => (
              <tr key={category.categoryId} className="border-t">
                <th scope="row" className="py-2 text-left font-medium">
                  {category.name}
                </th>
                <td className="py-2 text-right">
                  <ScoreNumber score={category.start} />
                </td>
                <td className="py-2 text-right">
                  <ScoreNumber score={category.end} />
                </td>
                <td className="py-2 text-right">
                  <Delta value={category.delta} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Lejos del objetivo">
          {summary.offTarget.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguna métrica con datos está por debajo de su objetivo.
            </p>
          ) : (
            <ul className="grid gap-2">
              {summary.offTarget.map((gap, index) => (
                <li
                  key={gap.metricId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {index === 0 ? (
                      <TargetIcon
                        aria-label="Cuello de botella"
                        className="size-4 shrink-0 text-primary"
                      />
                    ) : null}
                    <span className="truncate">
                      {gap.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {gap.categoryName}
                      </span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs tabular-nums">
                    {displayScore(gap.score)}/100 ·{" "}
                    <span className="text-primary">
                      {formatDelta(gap.potentialGain)} pts
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Ordenadas por los puntos de Life Score que sumarían al llegar a su
            objetivo. La primera es el cuello de botella.
          </p>
        </Panel>
        <Panel title="Mejorando más rápido">
          {summary.improvingFastest.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ninguna métrica subió esta semana.
            </p>
          ) : (
            <ul className="grid gap-2">
              {summary.improvingFastest.map((metric) => (
                <li
                  key={metric.metricId}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <ArrowUpRightIcon
                      aria-hidden="true"
                      className="size-4 shrink-0 text-primary"
                    />
                    <span className="truncate">{metric.name}</span>
                  </span>
                  <Delta value={metric.delta} className="shrink-0 text-xs" />
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {summary.stagnantDespiteExecution.length > 0 ? (
        <Panel title="Estancadas pese a buena ejecución">
          <p className="mb-3 text-sm text-muted-foreground">
            Ejecutaste bien (Week Score ≥ {HIGH_EXECUTION_SCORE}) pero estas
            métricas de las categorías que trabajaste casi no se movieron.
            Revisa la estrategia, los objetivos o cómo se miden.
          </p>
          <ul className="grid gap-2">
            {summary.stagnantDespiteExecution.map((metric) => (
              <li
                key={metric.metricId}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <ArrowDownRightIcon
                    aria-hidden="true"
                    className="size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="truncate">
                    {metric.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {metric.categoryName}
                    </span>
                  </span>
                </span>
                <Delta value={metric.delta} className="shrink-0 text-xs" />
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
