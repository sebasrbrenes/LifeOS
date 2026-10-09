import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import {
  addMetricValue,
  updateMetric,
  updateMetricSource,
} from "@/features/metrics/actions";
import { MetricControls } from "@/features/metrics/components/metric-controls";
import { MetricForm } from "@/features/metrics/components/metric-form";
import { SourceForm } from "@/features/metrics/components/source-form";
import { ValueForm } from "@/features/metrics/components/value-form";
import { ValueHistory } from "@/features/metrics/components/value-history";
import { loadMetricDetail } from "@/features/metrics/data";
import { AGGREGATION_LABELS, PERIOD_LABELS } from "@/features/metrics/labels";
import { describeTarget, formatMetricValue } from "@/features/metrics/values";
import { IssueList } from "@/features/scores/components/issue-list";
import {
  FreshnessBadge,
  ScoreBar,
  ScoreNumber,
} from "@/features/scores/components/score-visuals";
import { loadScoringOverview } from "@/features/scores/data";
import {
  formatDaysAgo,
  formatLocalDate,
  formatNumber,
  formatShare,
} from "@/lib/format";
import { toMetricInput } from "@/features/scores/mappers";
import { parseSourceFilter } from "@/lib/integrations/reconcile";
import { createClient } from "@/lib/supabase/server";

function sourceInitial(sourceMetric: string | null | undefined, raw: unknown) {
  const filter = parseSourceFilter(raw) ?? {};
  return {
    sourceMetric: sourceMetric ?? "manual",
    sportTypes: filter.sportTypes?.join(", ") ?? "",
    calendarIds: filter.calendarIds?.join(", ") ?? "",
    titleContains: filter.titleContains ?? "",
  };
}

export const metadata: Metadata = { title: "Métrica" };

export default function MetricPage({
  params,
  searchParams,
}: PageProps<"/metrics/[id]">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        href="/metrics"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Métricas
      </Link>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-[40rem] rounded-2xl bg-card" />
        }
      >
        <MetricContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MetricContent({
  params,
  searchParams,
}: Pick<PageProps<"/metrics/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const created = (await searchParams).created === "1";
  const detail = await loadMetricDetail(id);
  if (!detail) notFound();
  const { metric, score } = detail;
  const { categories, metrics } = await loadScoringOverview();
  const supabase = await createClient();
  const { data: connections } = await supabase
    .from("integrations")
    .select("provider")
    .eq("status", "connected");
  const connected = (connections ?? []).map((c) => c.provider);
  const input = toMetricInput(metric);
  const shape = {
    direction: input.direction,
    unit: metric.unit,
    config: metric.config,
  };

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <p className="font-mono text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
          {detail.categoryName}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{metric.name}</h1>
        {metric.description ? (
          <p className="text-sm text-muted-foreground">{metric.description}</p>
        ) : null}
      </header>

      {created ? (
        <FormMessage status="success">
          Métrica creada. Registra tu primer valor para que puntúe.
        </FormMessage>
      ) : null}

      <Panel title="Estado actual">
        {score ? (
          <div className="grid gap-4">
            <div className="flex items-end justify-between gap-4">
              <div className="grid gap-1">
                <span className="font-mono text-2xl tabular-nums">
                  {score.value === null
                    ? "Sin datos"
                    : formatMetricValue(score.value, shape)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {AGGREGATION_LABELS[input.aggregation].label} ·{" "}
                  {PERIOD_LABELS[input.period].toLowerCase()}
                </span>
              </div>
              <div className="text-right">
                <ScoreNumber
                  score={score.score}
                  className="text-4xl font-semibold"
                />
                <p className="text-xs text-muted-foreground">puntos</p>
              </div>
            </div>
            <ScoreBar score={score.score} />
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">Objetivo</dt>
                <dd>{describeTarget(shape)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Frescura</dt>
                <dd>
                  <FreshnessBadge freshness={score.freshness} />
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Último registro
                </dt>
                <dd>
                  {detail.lastEntryDaysAgo === null
                    ? "—"
                    : formatDaysAgo(detail.lastEntryDaysAgo)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">
                  Aporta al Life Score
                </dt>
                <dd className="font-mono tabular-nums">
                  {formatNumber(score.lifeContribution, 1)} pts
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              Periodo evaluado:{" "}
              {score.window.from
                ? formatLocalDate(score.window.from)
                : "inicio"}{" "}
              – {formatLocalDate(score.window.to)} · {score.eventCount}{" "}
              registro(s) · peso {formatShare(score.weightShare)} de su
              categoría · confianza {formatShare(score.confidence)}
            </p>
            <IssueList issues={score.issues} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {!metric.enabled
              ? "Métrica desactivada: no cuenta en el Life Score. Sus registros se conservan."
              : "Su categoría está desactivada, así que no cuenta en el Life Score."}
          </p>
        )}
      </Panel>

      <Panel title="Registrar valor">
        <ValueForm
          action={addMetricValue.bind(null, metric.id)}
          metric={detail.valueMetric}
          today={detail.today}
          idPrefix="new-value"
          submitLabel="Registrar"
        />
      </Panel>

      <Panel title={`Historial (${detail.history.length})`}>
        <ValueHistory
          entries={detail.history}
          metricId={metric.id}
          metric={detail.valueMetric}
          today={detail.today}
        />
      </Panel>

      <Panel title="Configuración">
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Editar nombre, objetivo y forma de puntuar
          </summary>
          <div className="mt-4">
            <MetricForm
              action={updateMetric.bind(null, metric.id)}
              categories={categories.map(({ id: categoryId, key, name }) => ({
                id: categoryId,
                key,
                name,
              }))}
              otherMetrics={metrics
                .filter((m) => m.id !== metric.id)
                .map(({ key, name }) => ({ key, name }))}
              initial={{
                name: metric.name,
                categoryId: metric.category_id,
                description: metric.description ?? "",
                unit: metric.unit ?? "",
                direction: input.direction,
                period: input.period,
                aggregation: input.aggregation,
                weight: String(metric.weight),
                config: metric.config,
              }}
              submitLabel="Guardar configuración"
              pendingLabel="Guardando…"
            />
            <p className="mt-3 text-xs text-muted-foreground">
              Cambiar objetivos o pesos crea una nueva versión de scoring; tus
              registros no cambian.
            </p>
          </div>
        </details>
      </Panel>

      <Panel title="Origen de los datos">
        <SourceForm
          action={updateMetricSource.bind(null, metric.id)}
          initial={sourceInitial(metric.source_metric, metric.source_filter)}
          connected={connected}
        />
      </Panel>

      <Panel title="Gestionar">
        <MetricControls
          metricId={metric.id}
          name={metric.name}
          enabled={metric.enabled}
          hasHistory={detail.history.length > 0}
        />
      </Panel>
    </div>
  );
}
