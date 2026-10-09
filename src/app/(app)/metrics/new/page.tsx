import { ArrowLeftIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { createMetric } from "@/features/metrics/actions";
import { MetricForm } from "@/features/metrics/components/metric-form";
import { METRIC_TEMPLATES } from "@/features/metrics/templates";
import { loadScoringOverview } from "@/features/scores/data";

export const metadata: Metadata = { title: "Nueva métrica" };

export default function NewMetricPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-2">
        <Link
          href="/metrics"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeftIcon aria-hidden="true" className="size-4" /> Métricas
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva métrica</h1>
        <p className="text-sm text-muted-foreground">
          Antes de añadirla, pregúntate: ¿este dato cambiará alguna decisión?
        </p>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-[40rem] rounded-2xl bg-card" />
        }
      >
        <NewMetricForm />
      </Suspense>
    </div>
  );
}

async function NewMetricForm() {
  const { categories, metrics } = await loadScoringOverview();
  return (
    <MetricForm
      action={createMetric}
      categories={categories.map(({ id, key, name }) => ({ id, key, name }))}
      otherMetrics={metrics.map(({ key, name }) => ({ key, name }))}
      templates={METRIC_TEMPLATES}
      submitLabel="Crear métrica"
      pendingLabel="Creando…"
    />
  );
}
