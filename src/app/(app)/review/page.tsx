import { ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { ScoreNumber } from "@/features/scores/components/score-visuals";
import { PendingReviewsBanner } from "@/features/week/components/pending-reviews";
import { loadPendingReviews, loadReviews } from "@/features/week/data";
import { formatDelta, formatWeekRange } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Revisiones" };

export default function ReviewsPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Revisiones semanales
        </h1>
        <p className="text-sm text-muted-foreground">
          Cada semana cerrada: cómo cambió tu estado y cómo ejecutaste.
        </p>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-64 rounded-2xl bg-card" />
        }
      >
        <ReviewsContent />
      </Suspense>
    </div>
  );
}

async function ReviewsContent() {
  const [reviews, pending] = await Promise.all([
    loadReviews(),
    loadPendingReviews(),
  ]);
  return (
    <>
      <PendingReviewsBanner weeks={pending} />
      <Panel title={`Semanas cerradas (${reviews.length})`}>
        {reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no has cerrado ninguna semana. El último día de cada semana,
            ciérrala desde{" "}
            <Link href="/week" className="underline underline-offset-4">
              Semana
            </Link>{" "}
            para guardar su revisión.
          </p>
        ) : (
          <ul className="grid gap-1">
            {reviews.map((review) => {
              const delta =
                review.life_score_start !== null &&
                review.life_score_end !== null
                  ? review.life_score_end - review.life_score_start
                  : null;
              return (
                <li key={review.week_start}>
                  <Link
                    href={`/review/${review.week_start}`}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-4 rounded-lg px-2 py-3 transition-colors hover:bg-accent"
                  >
                    <span className="text-sm font-medium">
                      {formatWeekRange(review.week_start, review.week_end)}
                    </span>
                    <span className="grid text-right">
                      <span className="text-[0.65rem] text-muted-foreground uppercase">
                        Life
                      </span>
                      <span className="flex items-baseline gap-1.5 text-sm">
                        <ScoreNumber score={review.life_score_end} />
                        {delta !== null ? (
                          <span
                            className={cn(
                              "font-mono text-xs tabular-nums",
                              delta > 0 && "text-primary",
                              delta < 0 && "text-destructive",
                            )}
                          >
                            {formatDelta(delta)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="grid text-right">
                        <span className="text-[0.65rem] text-muted-foreground uppercase">
                          Week
                        </span>
                        <ScoreNumber
                          score={review.week_score}
                          className="text-sm"
                        />
                      </span>
                      <ArrowRightIcon
                        aria-hidden="true"
                        className="size-4 text-muted-foreground"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
