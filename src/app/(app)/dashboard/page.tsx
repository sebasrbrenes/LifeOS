import type { Metadata } from "next";
import { Suspense } from "react";

import {
  CategoriesPanel,
  DashboardSkeleton,
  DataStatusPanel,
  ExtremesPanels,
  GetStartedPanel,
  LifeScorePanel,
  MainGoalPanel,
  WeekScorePanel,
} from "@/features/dashboard/components/dashboard-sections";
import {
  BottleneckPanel,
  StrategyAlertsPanel,
  TrendBadge,
} from "@/features/analytics/components/analytics-panels";
import {
  loadBottleneck,
  loadDiagnostics,
  loadTrends,
} from "@/features/analytics/data";
import { loadScoringOverview } from "@/features/scores/data";
import { PendingReviewsBanner } from "@/features/week/components/pending-reviews";
import { loadPendingReviews } from "@/features/week/data";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Dónde estás, cómo estás ejecutando y qué atacar a continuación.
        </p>
      </header>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  const [overview, pendingReviews, trends, bottleneck, diagnostics] =
    await Promise.all([
      loadScoringOverview(),
      loadPendingReviews(),
      loadTrends(),
      loadBottleneck(),
      loadDiagnostics(),
    ]);
  const { life, week } = overview;
  const hasMetrics = overview.metrics.length > 0;

  return (
    <div className="grid gap-4">
      <PendingReviewsBanner weeks={pendingReviews} />
      {!hasMetrics ? <GetStartedPanel /> : null}
      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <LifeScorePanel
          life={life}
          lifeAtWeekStart={overview.lifeAtWeekStart}
        />
        <WeekScorePanel week={week} weekStart={overview.weekStart} />
      </div>
      <CategoriesPanel
        categories={life.categories}
        trailing={Object.fromEntries(
          trends.categories.map((row) => [
            row.id,
            <TrendBadge key={row.id} trend={row.trends[30]} window={30} />,
          ]),
        )}
      />
      <StrategyAlertsPanel diagnostics={diagnostics.diagnostics} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ExtremesPanels life={life} />
        <BottleneckPanel gap={bottleneck} />
        <MainGoalPanel goal={overview.primaryGoal} />
      </div>
      {hasMetrics ? (
        <DataStatusPanel life={life} scoreVersion={overview.scoreVersion} />
      ) : null}
    </div>
  );
}
