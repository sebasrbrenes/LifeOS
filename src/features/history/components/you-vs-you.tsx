import { ScoreNumber } from "@/features/scores/components/score-visuals";
import { formatDelta, formatLocalDate } from "@/lib/format";
import { METRIC_DIRECTIONS, type ScoreComparisonRow } from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { formatMetricValue } from "../../metrics/values";
import type { MetricRow } from "../../scores/mappers";
import type { ComparisonView } from "../data";

function Delta({ value }: { value: number | null }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        value > 0 && "text-primary",
        value < 0 && "text-destructive",
      )}
    >
      {formatDelta(value)}
    </span>
  );
}

function ScoreRow({
  row,
  strong = false,
}: {
  row: ScoreComparisonRow;
  strong?: boolean;
}) {
  return (
    <tr className="border-t">
      <th
        scope="row"
        className={cn(
          "py-2 text-left",
          strong ? "font-semibold" : "font-medium",
        )}
      >
        {row.name}
      </th>
      <td className="py-2 text-right">
        <ScoreNumber score={row.before} />
      </td>
      <td className="py-2 text-right">
        <ScoreNumber score={row.after} />
      </td>
      <td className="py-2 text-right">
        <Delta value={row.delta} />
      </td>
    </tr>
  );
}

/** Spec §28: two dates side by side — scores, then the raw metric values. */
export function YouVsYouTable({
  view,
  metrics,
  today,
}: {
  view: ComparisonView;
  metrics: MetricRow[];
  today: string;
}) {
  const { comparison, from, to } = view;
  const metricById = new Map(metrics.map((m) => [m.id, m]));
  const label = (date: string) =>
    date === today ? "Hoy" : formatLocalDate(date);
  const show = (id: string, value: number | null) => {
    const metric = metricById.get(id);
    if (value === null) return "—";
    const direction = METRIC_DIRECTIONS.find((d) => d === metric?.direction);
    if (!metric || !direction) return String(value);
    const formatted = formatMetricValue(value, {
      direction,
      unit: metric.unit,
      config: metric.config,
    });
    return metric.unit && !formatted.includes(metric.unit)
      ? `${formatted} ${metric.unit}`
      : formatted;
  };

  return (
    <div className="grid gap-6">
      <table className="w-full text-sm">
        <caption className="sr-only">
          Scores el {label(from)} y el {label(to)}
        </caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th scope="col" className="py-2 font-normal">
              Score
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              {label(from)}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              {label(to)}
            </th>
            <th scope="col" className="py-2 text-right font-normal">
              Cambio
            </th>
          </tr>
        </thead>
        <tbody>
          <ScoreRow row={comparison.life} strong />
          {comparison.categories.map((row) => (
            <ScoreRow key={row.id} row={row} />
          ))}
        </tbody>
      </table>

      {comparison.metrics.length > 0 ? (
        <table className="w-full text-sm">
          <caption className="mb-2 text-left font-mono text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
            Valores de tus métricas
          </caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th scope="col" className="py-2 font-normal">
                Métrica
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {label(from)}
              </th>
              <th scope="col" className="py-2 text-right font-normal">
                {label(to)}
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.metrics.map((row) => (
              <tr key={row.id} className="border-t">
                <th scope="row" className="py-2 text-left font-medium">
                  {row.name}
                  <span className="block text-xs font-normal text-muted-foreground">
                    {row.categoryName}
                  </span>
                </th>
                <td className="py-2 text-right font-mono text-xs tabular-nums">
                  {show(row.id, row.valueBefore)}
                </td>
                <td className="py-2 text-right font-mono text-xs tabular-nums">
                  {show(row.id, row.valueAfter)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {view.bases.includes("current") ? (
        <p className="text-xs text-muted-foreground">
          Una de las fechas usa las reglas actuales porque las de su momento no
          se pudieron reproducir.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Cada fecha se puntúa con las reglas que tenía entonces. Los valores
          son los de la ventana de cada métrica en esa fecha.
        </p>
      )}
    </div>
  );
}
