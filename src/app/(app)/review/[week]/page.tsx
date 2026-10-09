import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { buttonVariants } from "@/components/ui/button";
import { CoachPanel } from "@/features/coach/components/coach-panel";
import { loadCoach } from "@/features/coach/data";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import {
  CloseWeekForm,
  ReviewNotesForm,
} from "@/features/week/components/review-forms";
import { ReviewSummary } from "@/features/week/components/review-summary";
import { loadReviewPage, type WeekView } from "@/features/week/data";
import { formatLocalDate, formatNumber, formatWeekRange } from "@/lib/format";
import { addDays } from "@/lib/scoring";

export const metadata: Metadata = { title: "Revisión semanal" };

export default function ReviewPage({
  params,
  searchParams,
}: PageProps<"/review/[week]">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <Link
        href="/review"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> Revisiones
      </Link>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-[40rem] rounded-2xl bg-card" />
        }
      >
        <ReviewContent params={params} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReviewContent({
  params,
  searchParams,
}: Pick<PageProps<"/review/[week]">, "params" | "searchParams">) {
  const { week: raw } = await params;
  const justClosed = (await searchParams).cerrada === "1";
  const page = await loadReviewPage(raw);
  if (!page) notFound();
  const { week } = page;
  const title = formatWeekRange(week.weekStart, week.weekEnd);

  if (page.kind === "not_ready") {
    return (
      <>
        <Header label="Revisión semanal" title={title} />
        <Panel title="Aún no">
          <p className="mb-4 text-sm text-muted-foreground">
            La revisión se hace a partir del último día de la semana, el{" "}
            {formatLocalDate(week.weekEnd)}.
          </p>
          <Link
            href={`/week?w=${week.weekStart}`}
            className={buttonVariants({ variant: "outline", size: "lg" })}
          >
            Ir a la semana
          </Link>
        </Panel>
      </>
    );
  }

  if (page.kind === "preview") {
    return (
      <>
        <Header label="Vista previa · sin guardar" title={title} />
        <FormMessage status="success">
          Así quedará la revisión si cierras la semana ahora. Si aún te falta
          registrar algo,{" "}
          <Link
            href={`/week?w=${week.weekStart}`}
            className="underline underline-offset-4"
          >
            hazlo antes
          </Link>
          .
        </FormMessage>
        <ReviewSummary
          summary={page.preview.summary}
          scoreVersion={page.scoreVersion}
        />
        <CommitmentsRecap week={week} />
        <Panel title="Cerrar la semana">
          <CloseWeekForm weekStart={week.weekStart} />
        </Panel>
      </>
    );
  }

  const { review } = page;
  const coach = await loadCoach(week.weekStart);
  const next = addDays(week.weekStart, 7);
  return (
    <>
      <Header label="Revisión semanal" title={title} />
      {justClosed ? (
        <div className="grid gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 sm:flex sm:items-center sm:justify-between">
          <p role="status" className="text-sm">
            Semana cerrada y revisión guardada. Ahora planifica la siguiente.
          </p>
          <Link
            href={next <= week.currentWeekStart ? "/week" : `/week?w=${next}`}
            className={buttonVariants({
              size: "lg",
              className: "h-11 shrink-0",
            })}
          >
            Planificar la semana <ArrowRightIcon aria-hidden="true" />
          </Link>
        </div>
      ) : null}
      {review.summary ? (
        <ReviewSummary
          summary={review.summary}
          scoreVersion={review.scoreVersion}
        />
      ) : (
        <Panel title="Resumen">
          <p className="text-sm text-muted-foreground">
            Life Score{" "}
            {review.life_score_start === null
              ? "—"
              : formatNumber(review.life_score_start, 1)}{" "}
            →{" "}
            {review.life_score_end === null
              ? "—"
              : formatNumber(review.life_score_end, 1)}{" "}
            · Week Score{" "}
            {review.week_score === null
              ? "—"
              : formatNumber(review.week_score, 0)}
            . El detalle de esta revisión no está disponible.
          </p>
        </Panel>
      )}
      <CommitmentsRecap week={week} />
      <Panel title="Análisis con IA">
        <CoachPanel weekStart={week.weekStart} {...coach} />
      </Panel>
      <Panel title="Notas">
        <ReviewNotesForm weekStart={week.weekStart} notes={review.user_notes} />
      </Panel>
    </>
  );
}

function Header({ label, title }: { label: string; title: string }) {
  return (
    <header className="grid gap-1">
      <p className="font-mono text-[0.7rem] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
    </header>
  );
}

function CommitmentsRecap({ week }: { week: WeekView }) {
  const commitments = week.week.commitments;
  return (
    <Panel
      title={`Compromisos (${commitments.length})`}
      action={
        <Link
          href={`/week?w=${week.weekStart}`}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Ver semana
        </Link>
      }
    >
      {commitments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta semana no tuvo compromisos.
        </p>
      ) : (
        <ul className="grid gap-2">
          {commitments.map((commitment) => (
            <li
              key={commitment.id}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span
                className={
                  commitment.status === "cancelled"
                    ? "text-muted-foreground line-through"
                    : undefined
                }
              >
                {commitment.title}
              </span>
              <span className="shrink-0 font-mono text-xs tabular-nums">
                {commitment.status === "cancelled"
                  ? "cancelado"
                  : commitment.completionType === "boolean"
                    ? commitment.completed
                      ? "hecho"
                      : "no hecho"
                    : `${formatNumber(commitment.actualValue)} / ${formatNumber(commitment.targetValue)}${commitment.unit ? ` ${commitment.unit}` : ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
