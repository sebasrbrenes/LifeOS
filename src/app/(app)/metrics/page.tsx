import { ChevronRightIcon, PlusIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { GetStartedPanel } from "@/features/dashboard/components/dashboard-sections";
import { PERIOD_LABELS } from "@/features/metrics/labels";
import { describeTarget, formatMetricValue } from "@/features/metrics/values";
import {
  FreshnessBadge,
  ScoreBar,
  ScoreNumber,
} from "@/features/scores/components/score-visuals";
import { loadScoringOverview } from "@/features/scores/data";
import { toMetricInput } from "@/features/scores/mappers";

export const metadata: Metadata = { title: "Métricas" };

export default function MetricsPage() {
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
          <p className="text-sm text-muted-foreground">
            Lo que mides, cómo puntúa y su último estado.
          </p>
        </div>
        <Link href="/metrics/new" className={buttonVariants({ size: "lg" })}>
          <PlusIcon aria-hidden="true" />
          Nueva métrica
        </Link>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-96 rounded-2xl bg-card" />
        }
      >
        <MetricsList />
      </Suspense>
    </div>
  );
}

async function MetricsList() {
  const { metrics, categories, life } = await loadScoringOverview();
  if (metrics.length === 0) return <GetStartedPanel />;

  const scores = new Map(
    life.categories.flatMap((c) => c.metrics).map((m) => [m.metricId, m]),
  );

  return (
    <div className="grid gap-6">
      {categories.map((category) => {
        const inCategory = metrics.filter((m) => m.category_id === category.id);
        if (inCategory.length === 0) return null;
        return (
          <section
            key={category.id}
            aria-labelledby={`cat-${category.key}`}
            className="grid gap-2"
          >
            <h2
              id={`cat-${category.key}`}
              className="font-mono text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase"
            >
              {category.name}
              {category.enabled ? "" : " · categoría desactivada"}
            </h2>
            <ul className="grid gap-2">
              {inCategory.map((metric) => {
                const score = scores.get(metric.id);
                const input = toMetricInput(metric);
                const shape = {
                  direction: input.direction,
                  unit: metric.unit,
                  config: metric.config,
                };
                return (
                  <li key={metric.id}>
                    <Link
                      href={`/metrics/${metric.id}`}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary/40"
                    >
                      <div className="grid min-w-0 gap-2">
                        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                          <span className="font-medium">{metric.name}</span>
                          {metric.enabled ? null : (
                            <span className="rounded border px-1.5 text-[0.7rem] text-muted-foreground">
                              Desactivada
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {describeTarget(shape)} ·{" "}
                          {PERIOD_LABELS[input.period]}
                        </span>
                        {score ? (
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                            <span className="font-mono tabular-nums">
                              {score.value === null
                                ? "Sin datos"
                                : formatMetricValue(score.value, shape)}
                            </span>
                            <FreshnessBadge freshness={score.freshness} />
                          </div>
                        ) : null}
                        <ScoreBar
                          score={score?.score ?? null}
                          className="max-w-sm"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <ScoreNumber
                          score={score?.score ?? null}
                          className="text-2xl font-semibold"
                        />
                        <ChevronRightIcon
                          aria-hidden="true"
                          className="size-4 text-muted-foreground"
                        />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
