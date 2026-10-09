import Link from "next/link";

import { formatNumber, formatShare } from "@/lib/format";
import type { CategoryScore, LifeScore, WeightedMetric } from "@/lib/scoring";

import { PERIOD_LABELS } from "../../metrics/labels";
import { describeTarget, formatMetricValue } from "../../metrics/values";
import type { MetricRow } from "../mappers";
import { IssueList } from "./issue-list";
import {
  FreshnessBadge,
  RankBadge,
  ScoreBar,
  ScoreNumber,
} from "./score-visuals";

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[0.7rem] text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function points(value: number) {
  return `${formatNumber(value, 1)} pts`;
}

function MetricExplanation({
  metric,
  definition,
}: {
  metric: WeightedMetric;
  definition: MetricRow | undefined;
}) {
  const shape = {
    direction: metric.direction,
    unit: metric.unit,
    config: definition?.config ?? {},
  };
  return (
    <li className="grid gap-3 rounded-xl border bg-background/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <Link
            href={`/metrics/${metric.metricId}`}
            className="font-medium hover:underline"
          >
            {metric.name}
          </Link>
          <span className="text-xs text-muted-foreground">
            {describeTarget(shape)} · {PERIOD_LABELS[metric.period]}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <FreshnessBadge freshness={metric.freshness} />
          <ScoreNumber score={metric.score} className="text-xl font-semibold" />
        </div>
      </div>
      <ScoreBar score={metric.score} />
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat
          label="Valor"
          value={
            metric.value === null
              ? "sin datos"
              : formatMetricValue(metric.value, shape)
          }
        />
        <Stat
          label="Peso en la categoría"
          value={formatShare(metric.weightShare)}
        />
        <Stat
          label="Peso efectivo"
          value={
            metric.score === null ? "—" : formatShare(metric.effectiveWeight)
          }
        />
        <Stat
          label="Aporta a la categoría"
          value={points(metric.categoryContribution)}
        />
        <Stat
          label="Aporta al Life Score"
          value={points(metric.lifeContribution)}
        />
      </dl>
      {metric.ratio ? (
        <p className="text-xs text-muted-foreground">
          {formatNumber(metric.ratio.numerator)} /{" "}
          {formatNumber(metric.ratio.denominator)}
        </p>
      ) : null}
      <IssueList issues={metric.issues} />
    </li>
  );
}

function CategoryExplanation({
  category,
  definitions,
}: {
  category: CategoryScore;
  definitions: ReadonlyMap<string, MetricRow>;
}) {
  return (
    <section
      id={`categoria-${category.key}`}
      className="scroll-mt-24 rounded-2xl border bg-card p-5"
      aria-labelledby={`titulo-${category.key}`}
    >
      <header className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={`titulo-${category.key}`} className="text-lg font-semibold">
            {category.name}
          </h2>
          <span className="flex items-center gap-2">
            <ScoreNumber
              score={category.score}
              className="text-3xl font-semibold"
            />
            <RankBadge rank={category.rank} />
          </span>
        </div>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            label="Peso configurado"
            value={formatShare(category.weightShare)}
          />
          <Stat
            label="Peso efectivo"
            value={
              category.score === null
                ? "—"
                : formatShare(category.effectiveWeight)
            }
          />
          <Stat
            label="Aporta al Life Score"
            value={points(category.lifeContribution)}
          />
          <Stat
            label="Completitud"
            value={formatShare(category.completeness)}
          />
        </dl>
        <IssueList issues={category.issues} />
      </header>

      {category.metrics.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Sin métricas activas: esta categoría no puntúa y su peso se reparte
          entre las demás.{" "}
          <Link
            href="/metrics/new"
            className="text-foreground underline underline-offset-4"
          >
            Añadir métrica
          </Link>
        </p>
      ) : (
        <ul className="mt-4 grid gap-3">
          {category.metrics.map((metric) => (
            <MetricExplanation
              key={metric.metricId}
              metric={metric}
              definition={definitions.get(metric.metricId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function ScoreBreakdown({
  life,
  metrics,
}: {
  life: LifeScore;
  metrics: readonly MetricRow[];
}) {
  const definitions = new Map(metrics.map((m) => [m.id, m]));
  return (
    <div className="grid gap-4">
      {life.categories.map((category) => (
        <CategoryExplanation
          key={category.categoryId}
          category={category}
          definitions={definitions}
        />
      ))}
    </div>
  );
}
