import {
  ArrowRightIcon,
  FlagIcon,
  PlusIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { formatDelta, formatLocalDate, formatShare } from "@/lib/format";
import {
  categoryExtremes,
  displayScore,
  type CategoryScore,
  type Freshness,
  type LifeScore,
  type WeekScore,
} from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { FRESHNESS_LABELS } from "../../metrics/labels";
import type { Goal, ScoreVersion } from "../../scores/data";
import { IssueList } from "../../scores/components/issue-list";
import {
  RankBadge,
  ScoreBar,
  ScoreNumber,
  ScoreRing,
} from "../../scores/components/score-visuals";

/** Section card used across the dashboard. */
export function Panel({
  title,
  action,
  className,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-2xl border bg-card p-5", className)}>
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-mono text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function LifeScorePanel({
  life,
  lifeAtWeekStart,
}: {
  life: LifeScore;
  /** Same-configuration Life Score as the week started. */
  lifeAtWeekStart: number | null;
}) {
  const weekDelta =
    life.score !== null && lifeAtWeekStart !== null
      ? life.score - lifeAtWeekStart
      : null;
  const scored = life.categories.filter((c) => c.score !== null).length;
  return (
    <Panel
      title="Life Score"
      action={
        <Link
          href="/score"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Por qué <ArrowRightIcon aria-hidden="true" className="size-3" />
        </Link>
      }
      className="relative overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6">
        <div className="grid justify-items-center gap-2">
          <ScoreRing score={life.score} rank={life.rank} label="Life Score" />
          {weekDelta !== null ? (
            <p className="text-sm text-muted-foreground">
              <span
                className={cn(
                  "font-mono tabular-nums",
                  weekDelta > 0 && "text-primary",
                  weekDelta < 0 && "text-destructive",
                )}
              >
                {formatDelta(weekDelta)}
              </span>{" "}
              esta semana
            </p>
          ) : null}
        </div>
        <dl className="grid w-full gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground">Mide</dt>
            <dd>Tu estado actual frente a tus objetivos.</dd>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">
                Categorías con datos
              </dt>
              <dd className="font-mono text-lg tabular-nums">
                {scored}/{life.categories.length}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Completitud</dt>
              <dd className="font-mono text-lg tabular-nums">
                {formatShare(life.completeness)}
              </dd>
            </div>
          </div>
        </dl>
      </div>
    </Panel>
  );
}

export function WeekScorePanel({
  week,
  weekStart,
}: {
  week: WeekScore;
  weekStart: string;
}) {
  return (
    <Panel
      title="Week Score"
      action={
        <Link
          href="/week"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {week.totalCount > 0 ? "Ver semana" : "Planificar"}{" "}
          <ArrowRightIcon aria-hidden="true" className="size-3" />
        </Link>
      }
    >
      {week.score === null ? (
        <div className="grid gap-2">
          <ScoreNumber score={null} className="text-5xl font-semibold" />
          <p className="text-sm text-muted-foreground">
            Sin compromisos para la semana del {formatLocalDate(weekStart)}. El
            Week Score mide tu ejecución, no tu estado:{" "}
            <Link href="/week" className="underline underline-offset-4">
              define tus compromisos
            </Link>{" "}
            para verlo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="flex items-end gap-3">
            <ScoreNumber
              score={week.score}
              className="text-5xl leading-none font-semibold"
            />
            <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
          </div>
          <ScoreBar score={week.score} />
          <p className="text-sm text-muted-foreground">
            {week.completedCount} de {week.totalCount} compromisos completados ·
            semana del {formatLocalDate(weekStart)}
          </p>
        </div>
      )}
    </Panel>
  );
}

export function CategoriesPanel({
  categories,
  trailing,
}: {
  categories: CategoryScore[];
  /** Extra content per category id, e.g. its trend. */
  trailing?: Readonly<Record<string, React.ReactNode>>;
}) {
  return (
    <Panel title="Categorías">
      <ul className="grid gap-1">
        {categories.map((category) => (
          <li key={category.categoryId}>
            <Link
              href={`/score#categoria-${category.key}`}
              className={cn(
                "grid items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent",
                trailing
                  ? "grid-cols-[minmax(0,6rem)_1fr_auto_3.75rem] sm:grid-cols-[10rem_1fr_auto_4.5rem]"
                  : "grid-cols-[minmax(0,7rem)_1fr_auto] sm:grid-cols-[10rem_1fr_auto]",
              )}
              aria-label={`${category.name}: ${
                category.score === null
                  ? "sin datos"
                  : `${displayScore(category.score)}, rango ${category.rank?.label}`
              }`}
            >
              <span className="truncate text-sm font-medium">
                {category.name}
              </span>
              <ScoreBar score={category.score} />
              <span className="flex w-16 items-center justify-end gap-2">
                <ScoreNumber score={category.score} className="text-sm" />
                <RankBadge rank={category.rank} size="sm" />
              </span>
              {trailing ? (
                <span className="text-right">
                  {trailing[category.categoryId]}
                </span>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function ExtremeCard({
  label,
  icon: Icon,
  category,
  empty,
}: {
  label: string;
  icon: typeof TrendingUpIcon;
  category: CategoryScore | null;
  empty: string;
}) {
  return (
    <Panel title={label}>
      {category ? (
        <Link
          href={`/score#categoria-${category.key}`}
          className="group grid gap-1"
        >
          <span className="flex items-center gap-2 text-lg font-semibold">
            <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
            {category.name}
          </span>
          <span className="flex items-center gap-2">
            <ScoreNumber score={category.score} className="text-2xl" />
            <RankBadge rank={category.rank} size="sm" />
          </span>
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}
    </Panel>
  );
}

export function ExtremesPanels({ life }: { life: LifeScore }) {
  const { strongest, weakest } = categoryExtremes(life);
  const onlyOne = strongest !== null && strongest === weakest;
  return (
    <>
      <ExtremeCard
        label="Categoría más fuerte"
        icon={TrendingUpIcon}
        category={strongest}
        empty="Aparecerá cuando haya categorías con datos."
      />
      <ExtremeCard
        label="Mayor debilidad"
        icon={TrendingDownIcon}
        category={onlyOne ? null : weakest}
        empty={
          onlyOne
            ? "Necesitas al menos dos categorías con datos para compararlas."
            : "Aparecerá cuando haya categorías con datos."
        }
      />
    </>
  );
}

export function MainGoalPanel({ goal }: { goal: Goal | null }) {
  return (
    <Panel
      title="Objetivo principal"
      action={
        <Link
          href="/settings#objetivo"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {goal ? "Editar" : "Definir"}
        </Link>
      }
    >
      {goal ? (
        <div className="grid gap-1">
          <p className="flex items-start gap-2 text-lg font-semibold">
            <FlagIcon
              aria-hidden="true"
              className="mt-1 size-4 shrink-0 text-primary"
            />
            {goal.title}
          </p>
          {goal.target_date ? (
            <p className="text-sm text-muted-foreground">
              Fecha objetivo: {formatLocalDate(goal.target_date)}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Aún no has definido tu objetivo principal. Te ayuda a decidir qué
          atacar primero.
        </p>
      )}
    </Panel>
  );
}

const FRESHNESS_ORDER: Freshness[] = [
  "fresh",
  "delayed",
  "stale",
  "missing",
  "error",
];

export function DataStatusPanel({
  life,
  scoreVersion,
}: {
  life: LifeScore;
  scoreVersion: ScoreVersion | null;
}) {
  const metrics = life.categories.flatMap((c) => c.metrics);
  const counts = new Map<Freshness, number>();
  for (const metric of metrics)
    counts.set(metric.freshness, (counts.get(metric.freshness) ?? 0) + 1);
  const warnings = [
    ...life.issues,
    ...life.categories.flatMap((c) => c.issues),
    ...metrics.flatMap((m) =>
      m.issues.filter(
        (i) => i.code === "invalid_config" || i.code === "source_unavailable",
      ),
    ),
  ];

  return (
    <Panel title="Estado de los datos">
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Completitud</dt>
          <dd className="font-mono text-xl tabular-nums">
            {formatShare(life.completeness)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Confianza</dt>
          <dd className="font-mono text-xl tabular-nums">
            {formatShare(life.confidence)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Métricas activas</dt>
          <dd className="font-mono text-xl tabular-nums">{metrics.length}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Scoring</dt>
          <dd className="font-mono text-xl tabular-nums">
            {scoreVersion ? `v${scoreVersion.version}` : "—"}
          </dd>
        </div>
      </dl>
      {metrics.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {FRESHNESS_ORDER.filter((f) => counts.get(f)).map((freshness) => (
            <li key={freshness}>
              {FRESHNESS_LABELS[freshness]}:{" "}
              <span className="font-mono text-foreground">
                {counts.get(freshness)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <IssueList issues={warnings} className="mt-4" />
    </Panel>
  );
}

export function GetStartedPanel() {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/30 bg-primary/5 p-6">
      <div className="grid gap-3 sm:max-w-xl">
        <h2 className="text-lg font-semibold">Empieza con 3–5 métricas</h2>
        <p className="text-sm text-muted-foreground">
          Life OS calcula tu Life Score a partir de métricas reales. Elige las
          que cambiarían tus decisiones: kilómetros, ahorro, horas de estudio,
          nivel de carrera… Puedes partir de plantillas y ajustar los objetivos.
        </p>
        <div>
          <Link href="/metrics/new" className={buttonVariants({ size: "lg" })}>
            <PlusIcon aria-hidden="true" />
            Crear mi primera métrica
          </Link>
        </div>
      </div>
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-4 md:grid-cols-2">
      <div className="h-64 rounded-2xl bg-card" />
      <div className="h-64 rounded-2xl bg-card" />
      <div className="h-80 rounded-2xl bg-card md:col-span-2" />
    </div>
  );
}
