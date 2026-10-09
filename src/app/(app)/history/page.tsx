import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import {
  CategoryTrendsChart,
  LifeScoreChart,
  WeekScoreChart,
} from "@/features/history/components/charts";
import { YouVsYouTable } from "@/features/history/components/you-vs-you";
import {
  loadComparison,
  loadHistory,
  type HistoryView,
} from "@/features/history/data";
import { TrendsTable } from "@/features/analytics/components/analytics-panels";
import { TREND_WINDOWS, loadTrends } from "@/features/analytics/data";
import { describeSeries } from "@/features/history/describe";
import { HISTORY_RANGES, parseRange } from "@/features/history/range";
import { loadScoringInputs } from "@/features/scores/data";
import { formatLocalDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Historial" };

const RANGE_LABELS: Record<number, string> = {
  30: "30 días",
  90: "90 días",
  180: "6 meses",
  365: "1 año",
};

export default function HistoryPage({ searchParams }: PageProps<"/history">) {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Historial</h1>
        <p className="text-sm text-muted-foreground">
          Cómo ha cambiado tu estado y tu ejecución con el tiempo.
        </p>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="grid gap-4">
            <div className="h-80 rounded-2xl bg-card" />
            <div className="h-80 rounded-2xl bg-card" />
          </div>
        }
      >
        <HistoryContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function HistoryContent({
  searchParams,
}: Pick<PageProps<"/history">, "searchParams">) {
  const params = await searchParams;
  const range = parseRange(params.rango);
  const [history, comparison, inputs, trends] = await Promise.all([
    loadHistory(range),
    loadComparison(params.desde, params.hasta),
    loadScoringInputs(),
    loadTrends(),
  ]);
  const hasData = history.points.some((p) => p.lifeScore !== null);

  return (
    <div className="grid gap-4">
      <nav aria-label="Periodo" className="flex flex-wrap gap-2">
        {HISTORY_RANGES.map((option) => (
          <Link
            key={option}
            href={`/history?rango=${option}`}
            aria-current={option === range ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-full border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground",
              option === range &&
                "border-primary/40 bg-primary/10 text-foreground",
            )}
          >
            {RANGE_LABELS[option]}
          </Link>
        ))}
      </nav>

      <Panel title="Tendencia">
        <TrendsTable
          rows={[trends.life, ...trends.categories]}
          windows={TREND_WINDOWS}
        />
        <p className="mt-3 text-xs text-muted-foreground">
          Cambio frente a hace 7, 30 y 90 días, con tu configuración actual en
          ambos extremos para que un cambio de pesos no parezca progreso.
        </p>
      </Panel>

      <Panel title="Life Score · estado">
        {hasData ? (
          <figure className="grid gap-3">
            <div aria-hidden="true">
              <LifeScoreChart points={history.points} />
            </div>
            <figcaption className="sr-only">
              {describeSeries(
                "Life Score",
                history.points.map((p) => p.lifeScore),
              )}
            </figcaption>
            <RulesNote history={history} />
          </figure>
        ) : (
          <EmptyHistory history={history} />
        )}
      </Panel>

      {hasData ? (
        <Panel title="Categorías">
          <figure className="grid gap-3">
            <CategoryTrendsChart
              points={history.points}
              categories={history.categories}
            />
            <figcaption className="sr-only">
              {history.categories
                .map((category) =>
                  describeSeries(
                    category.name,
                    history.points.map(
                      (p) => p.categories[category.id] ?? null,
                    ),
                  ),
                )
                .join(" ")}
            </figcaption>
          </figure>
        </Panel>
      ) : null}

      <Panel title="Week Score · ejecución">
        {history.weekScores.length > 0 ? (
          <figure className="grid gap-3">
            <div aria-hidden="true">
              <WeekScoreChart weeks={history.weekScores} />
            </div>
            <figcaption className="text-xs text-muted-foreground">
              <span className="sr-only">
                {describeSeries(
                  "Week Score",
                  history.weekScores.map((w) => w.weekScore),
                )}{" "}
              </span>
              Semanas cerradas en el periodo. Es un gráfico aparte a propósito:
              ejecución y estado no se mezclan.
            </figcaption>
          </figure>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no hay semanas cerradas en este periodo.{" "}
            <Link href="/week" className="underline underline-offset-4">
              Cierra tu semana
            </Link>{" "}
            para ver tu ejecución en el tiempo.
          </p>
        )}
      </Panel>

      <Panel title="Tú vs tú">
        <form
          action="/history"
          className="mb-5 grid grid-cols-2 gap-3 sm:flex sm:items-end"
        >
          <input type="hidden" name="rango" value={range} />
          <label className="grid min-w-0 gap-1 text-sm">
            Antes
            <input
              type="date"
              name="desde"
              defaultValue={comparison.from}
              max={inputs.today}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base md:text-sm"
            />
          </label>
          <label className="grid min-w-0 gap-1 text-sm">
            Después
            <input
              type="date"
              name="hasta"
              defaultValue={comparison.to}
              max={inputs.today}
              className="h-11 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base md:text-sm"
            />
          </label>
          <Button
            type="submit"
            size="lg"
            variant="outline"
            className="col-span-2 h-11 sm:col-span-1"
          >
            Comparar
          </Button>
        </form>
        <YouVsYouTable
          view={comparison}
          metrics={inputs.metrics}
          today={inputs.today}
        />
      </Panel>
    </div>
  );
}

function RulesNote({ history }: { history: HistoryView }) {
  const versions = history.versionsInRange.length;
  return (
    <p className="text-xs text-muted-foreground">
      Cada punto se calcula con las reglas vigentes en esa fecha
      {versions > 1 ? ` (${versions} versiones de scoring en el periodo)` : ""}:
      cambiar pesos u objetivos no reescribe el pasado.
      {history.approximate
        ? " Algunos puntos usan las reglas actuales porque las de su fecha no se pudieron reproducir."
        : ""}
    </p>
  );
}

function EmptyHistory({ history }: { history: HistoryView }) {
  return (
    <p className="text-sm text-muted-foreground">
      {history.firstDataDate
        ? `Sin datos en este periodo. Tu primer registro es del ${formatLocalDate(history.firstDataDate)}: prueba un periodo más largo.`
        : "Aún no hay registros. Cuando registres valores en tus métricas, aquí verás su evolución — también si los fechas en el pasado."}
    </p>
  );
}
