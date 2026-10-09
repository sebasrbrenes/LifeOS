import type { Metadata } from "next";
import { Suspense } from "react";

import { FormMessage } from "@/components/forms/form-message";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { CsvImportForm } from "@/features/integrations/components/csv-import-form";
import { ProviderCard } from "@/features/integrations/components/provider-card";
import { integrationNotice } from "@/features/integrations/notices";
import { PROVIDERS } from "@/features/integrations/providers";
import { loadScoringOverview } from "@/features/scores/data";
import { getServerEnv } from "@/lib/env/server";
import { providerAvailability } from "@/lib/env/server-schema";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Integraciones" };

export default function IntegrationsPage({
  searchParams,
}: PageProps<"/integrations">) {
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Integraciones</h1>
        <p className="text-sm text-muted-foreground">
          Menos datos a mano: conecta tus fuentes o importa un archivo. Cada
          valor importado guarda su origen.
        </p>
      </header>
      <Suspense
        fallback={
          <div aria-hidden="true" className="h-96 rounded-2xl bg-card" />
        }
      >
        <IntegrationsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function IntegrationsContent({
  searchParams,
}: Pick<PageProps<"/integrations">, "searchParams">) {
  const notice = integrationNotice(await searchParams);
  const { metrics, profile } = await loadScoringOverview();
  const supabase = await createClient();
  const { data: connections, error } = await supabase
    .from("integrations")
    .select(
      "provider, status, scopes, last_synced_at, last_success_at, last_error",
    );
  if (error) throw new Error(`Failed to load integrations: ${error.message}`);
  const env = getServerEnv();

  return (
    <>
      {notice ? (
        <FormMessage status={notice.status}>{notice.message}</FormMessage>
      ) : null}
      <Panel title="Importar CSV">
        {metrics.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Crea primero una métrica para importar sus valores.
          </p>
        ) : (
          <CsvImportForm
            metrics={metrics.map(({ id, name, unit }) => ({ id, name, unit }))}
          />
        )}
      </Panel>
      <section aria-label="Fuentes conectables" className="grid gap-4">
        {PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            availability={providerAvailability(env, provider.id)}
            connection={
              connections.find((c) => c.provider === provider.id) ?? null
            }
            timeZone={profile.timezone}
          />
        ))}
      </section>
    </>
  );
}
