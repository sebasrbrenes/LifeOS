import {
  ArrowDownRightIcon,
  ArrowRightIcon,
  ArrowUpRightIcon,
  LightbulbIcon,
  TargetIcon,
} from "lucide-react";
import Link from "next/link";

import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { formatDelta } from "@/lib/format";
import {
  displayScore,
  type CategoryDiagnostic,
  type MetricGap,
  type ScoreTrend,
  type TrendRow,
} from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { diagnosticCopy } from "../copy";

const TREND_LABEL = { up: "sube", flat: "estable", down: "baja" } as const;

/** Arrow + signed change, e.g. "↗ +4,2"; "—" without data. */
export function TrendBadge({
  trend,
  window,
  className,
}: {
  trend: ScoreTrend | undefined;
  window: number;
  className?: string;
}) {
  if (!trend || trend.direction === null || trend.delta === null) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">sin datos hace {window} días</span>
      </span>
    );
  }
  const Icon =
    trend.direction === "up"
      ? ArrowUpRightIcon
      : trend.direction === "down"
        ? ArrowDownRightIcon
        : ArrowRightIcon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-mono text-xs tabular-nums",
        trend.direction === "up" && "text-primary",
        trend.direction === "down" && "text-destructive",
        trend.direction === "flat" && "text-muted-foreground",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {formatDelta(trend.delta)}
      <span className="sr-only">
        {" "}
        en {window} días ({TREND_LABEL[trend.direction]})
      </span>
    </span>
  );
}

export function BottleneckPanel({ gap }: { gap: MetricGap | null }) {
  return (
    <Panel title="Cuello de botella">
      {gap ? (
        <Link href={`/metrics/${gap.metricId}`} className="group grid gap-1">
          <span className="flex items-center gap-2 text-lg font-semibold">
            <TargetIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-primary"
            />
            {gap.name}
          </span>
          <span className="text-sm text-muted-foreground">
            {gap.categoryName} · {displayScore(gap.score)}/100. Llevarla a su
            objetivo sumaría{" "}
            <span className="font-mono text-primary">
              {formatDelta(gap.potentialGain)} pts
            </span>{" "}
            al Life Score.
          </span>
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aparecerá cuando alguna métrica con datos esté por debajo de su
          objetivo.
        </p>
      )}
    </Panel>
  );
}

/** Spec §11 alerts. Rendered only when there is something to say. */
export function StrategyAlertsPanel({
  diagnostics,
}: {
  diagnostics: CategoryDiagnostic[];
}) {
  if (diagnostics.length === 0) return null;
  return (
    <Panel title="Alertas de estrategia">
      <ul className="grid gap-3">
        {diagnostics.map((diagnostic) => {
          const copy = diagnosticCopy(diagnostic);
          return (
            <li
              key={`${diagnostic.code}-${diagnostic.categoryId}`}
              className="flex items-start gap-3"
            >
              <LightbulbIcon
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-amber-300"
              />
              <div className="grid gap-0.5">
                <p className="text-sm font-medium">{copy.title}</p>
                <p className="text-sm text-muted-foreground">{copy.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Analítica de producto basada en tus últimas semanas cerradas, no un
        diagnóstico personal.
      </p>
    </Panel>
  );
}

/** Spec §6.2: trend over 7 / 30 / 90 days, Life Score and categories. */
export function TrendsTable({
  rows,
  windows,
}: {
  rows: TrendRow[];
  windows: readonly number[];
}) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">
        Cambio de cada score en los últimos {windows.join(", ")} días
      </caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-2 font-normal">
            Score
          </th>
          <th scope="col" className="py-2 text-right font-normal">
            Hoy
          </th>
          {windows.map((days) => (
            <th key={days} scope="col" className="py-2 text-right font-normal">
              {days} d
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={row.id} className="border-t">
            <th
              scope="row"
              className={cn(
                "py-2 text-left",
                index === 0 ? "font-semibold" : "font-medium",
              )}
            >
              {row.name}
            </th>
            <td className="py-2 text-right font-mono tabular-nums">
              {row.now === null ? "—" : displayScore(row.now)}
            </td>
            {windows.map((days) => (
              <td key={days} className="py-2 text-right">
                <TrendBadge trend={row.trends[days]} window={days} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
