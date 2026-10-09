import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClipboardCheckIcon,
  LockIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import {
  ScoreBar,
  ScoreNumber,
} from "@/features/scores/components/score-visuals";
import { createCommitment } from "@/features/week/actions";
import { CommitmentForm } from "@/features/week/components/commitment-form";
import { CommitmentItem } from "@/features/week/components/commitment-item";
import { PendingReviewsBanner } from "@/features/week/components/pending-reviews";
import { CopyWeekButton } from "@/features/week/components/week-controls";
import {
  loadPendingReviews,
  loadWeek,
  type WeekView,
} from "@/features/week/data";
import { MAX_WEEKS_AHEAD } from "@/features/week/period";
import { formatShare, formatWeekRange } from "@/lib/format";
import { addDays } from "@/lib/scoring";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Semana" };

export default function WeekPage({ searchParams }: PageProps<"/week">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <Suspense
        fallback={
          <div aria-hidden="true" className="grid gap-4">
            <div className="h-16 rounded-2xl bg-card" />
            <div className="h-48 rounded-2xl bg-card" />
            <div className="h-80 rounded-2xl bg-card" />
          </div>
        }
      >
        <WeekContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

const PHASE_LABELS = {
  current: "Esta semana",
  future: "Planificación",
  past: "Semana pasada",
} as const;

async function WeekContent({
  searchParams,
}: Pick<PageProps<"/week">, "searchParams">) {
  const { w } = await searchParams;
  const view = await loadWeek(typeof w === "string" ? w : undefined);
  const pending = await loadPendingReviews();
  const categoryNames = new Map(view.categories.map((c) => [c.id, c.name]));
  const lastPlannable = addDays(view.currentWeekStart, 7 * MAX_WEEKS_AHEAD);
  const nextWeek = addDays(view.weekStart, 7);

  return (
    <>
      <header className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="grid gap-1">
            <p className="font-mono text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
              {view.closed ? "Semana cerrada" : PHASE_LABELS[view.phase]}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {formatWeekRange(view.weekStart, view.weekEnd)}
            </h1>
          </div>
          <nav aria-label="Cambiar de semana" className="flex gap-2">
            <Link
              href={`/week?w=${addDays(view.weekStart, -7)}`}
              className={buttonVariants({
                variant: "outline",
                size: "icon-lg",
                className: "size-11",
              })}
              aria-label="Semana anterior"
            >
              <ChevronLeftIcon aria-hidden="true" />
            </Link>
            {nextWeek <= lastPlannable ? (
              <Link
                href={`/week?w=${nextWeek}`}
                className={buttonVariants({
                  variant: "outline",
                  size: "icon-lg",
                  className: "size-11",
                })}
                aria-label="Semana siguiente"
              >
                <ChevronRightIcon aria-hidden="true" />
              </Link>
            ) : null}
          </nav>
        </div>
        {view.weekStart !== view.currentWeekStart ? (
          <Link
            href="/week"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Volver a esta semana
          </Link>
        ) : null}
      </header>

      <PendingReviewsBanner
        weeks={pending.filter((week) => week !== view.weekStart)}
      />
      <WeekStatus view={view} />
      <WeekScoreSummary view={view} />

      <Panel title={`Compromisos (${view.commitments.length})`}>
        {view.commitments.length === 0 ? (
          <div className="grid gap-4">
            <p className="text-sm text-muted-foreground">
              {view.canPlan
                ? "Aún no hay compromisos. Define 3–7 acciones que controles tú: entrenamientos, bloques de estudio, solicitudes enviadas…"
                : "Esta semana no tuvo compromisos."}
            </p>
            {view.canPlan && view.previousCommitmentCount > 0 ? (
              <CopyWeekButton
                fromWeek={view.previousWeekStart}
                toWeek={view.weekStart}
                count={view.previousCommitmentCount}
              />
            ) : null}
          </div>
        ) : (
          <ul className="grid gap-3">
            {view.week.commitments.map((commitment) => (
              <CommitmentItem
                key={commitment.id}
                commitment={{
                  ...commitment,
                  categoryName: commitment.categoryId
                    ? (categoryNames.get(commitment.categoryId) ?? null)
                    : null,
                }}
                categories={view.categories}
                canTrack={view.canTrack}
                canPlan={view.canPlan}
              />
            ))}
          </ul>
        )}
      </Panel>

      {view.canPlan ? (
        <Panel title="Añadir compromiso">
          <CommitmentForm
            action={createCommitment.bind(null, view.weekStart)}
            categories={view.categories}
            idPrefix="new-commitment"
            submitLabel="Añadir compromiso"
            pendingLabel="Añadiendo…"
            resetOnSuccess
          />
        </Panel>
      ) : null}
    </>
  );
}

function WeekStatus({ view }: { view: WeekView }) {
  if (view.closed) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <p className="flex items-center gap-2 text-sm">
          <LockIcon
            aria-hidden="true"
            className="size-4 text-muted-foreground"
          />
          Semana cerrada: sus compromisos ya son historial.
        </p>
        <Link
          href={`/review/${view.weekStart}`}
          className={buttonVariants({ variant: "outline", size: "lg" })}
        >
          Ver revisión <ArrowRightIcon aria-hidden="true" />
        </Link>
      </div>
    );
  }
  if (view.closable) {
    return (
      <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex sm:items-center sm:justify-between">
        <p className="text-sm">
          {view.phase === "current"
            ? "Último día de la semana: cuando termines de registrar, ciérrala y haz la revisión."
            : "Esta semana terminó. Registra lo que falte y ciérrala para guardar su revisión."}
        </p>
        <Link
          href={`/review/${view.weekStart}`}
          className={buttonVariants({ size: "lg", className: "h-11 shrink-0" })}
        >
          <ClipboardCheckIcon aria-hidden="true" />
          Cerrar y revisar
        </Link>
      </div>
    );
  }
  if (view.phase === "future") {
    return (
      <p className="rounded-2xl border bg-card p-4 text-sm text-muted-foreground">
        Planificación: el progreso se registra cuando empiece la semana.
      </p>
    );
  }
  return null;
}

function WeekScoreSummary({ view }: { view: WeekView }) {
  const { week } = view;
  return (
    <Panel title="Week Score">
      <div className="grid gap-3">
        <div className="flex items-end gap-3">
          <ScoreNumber
            score={week.score}
            className="text-5xl leading-none font-semibold"
          />
          {week.score !== null ? (
            <span className="pb-1 text-sm text-muted-foreground">/ 100</span>
          ) : null}
        </div>
        <ScoreBar score={week.score} />
        <p className={cn("text-sm text-muted-foreground")}>
          {week.score === null
            ? week.totalCount > 0
              ? "Todos los compromisos tienen peso 0."
              : "Sin compromisos activos: el Week Score aparecerá cuando los definas."
            : `${week.completedCount} de ${week.totalCount} compromisos completados (${formatShare(week.executionRate ?? 0)}).`}
        </p>
        <p className="text-xs text-muted-foreground">
          Mide tu ejecución, no tu estado. Cada compromiso suma{" "}
          <span className="font-mono">min(hecho / objetivo, 1) × su peso</span>:
          pasarte del objetivo no da puntos extra. Nunca se mezcla con el Life
          Score.
        </p>
      </div>
    </Panel>
  );
}
