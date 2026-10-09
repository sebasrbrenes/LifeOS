import { DownloadIcon, KeyRoundIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { buttonVariants } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { Panel } from "@/features/dashboard/components/dashboard-sections";
import { loadScoringOverview } from "@/features/scores/data";
import { CategoryWeightsForm } from "@/features/settings/components/category-weights-form";
import { MainGoalForm } from "@/features/settings/components/main-goal-form";
import { ProfileForm } from "@/features/settings/components/profile-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Ajustes" };

export default function SettingsPage() {
  return (
    <div className="grid max-w-3xl gap-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-sm text-muted-foreground">
          Prioridades, preferencias y cuenta.
        </p>
      </header>

      <Suspense
        fallback={
          <div aria-hidden="true" className="h-[40rem] rounded-2xl bg-card" />
        }
      >
        <SettingsContent />
      </Suspense>

      <Panel title="Cuenta">
        <div className="grid gap-6">
          <Suspense
            fallback={
              <div className="h-10 w-48 rounded bg-muted" aria-hidden="true" />
            }
          >
            <AccountEmail />
          </Suspense>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/reset-password"
              className={buttonVariants({ variant: "outline", size: "lg" })}
            >
              <KeyRoundIcon aria-hidden="true" />
              Cambiar contraseña
            </Link>
            <SignOutButton variant="outline" className="h-9" />
          </div>
        </div>
      </Panel>
    </div>
  );
}

async function SettingsContent() {
  const { categories, profile, primaryGoal } = await loadScoringOverview();
  return (
    <>
      <section id="pesos" className="scroll-mt-24">
        <Panel title="Pesos de las categorías">
          <p className="mb-4 text-sm text-muted-foreground">
            Cuánto pesa cada área en tu Life Score. Las categorías activas deben
            sumar 100 %. Desactiva una categoría si ahora no es prioritaria.
          </p>
          <CategoryWeightsForm
            categories={categories.map(({ id, name, weight, enabled }) => ({
              id,
              name,
              weight: Number(weight),
              enabled,
            }))}
          />
        </Panel>
      </section>

      <section id="objetivo" className="scroll-mt-24">
        <Panel title="Objetivo principal">
          <MainGoalForm
            goal={primaryGoal}
            categories={categories
              .filter((c) => c.enabled)
              .map(({ id, name }) => ({ id, name }))}
          />
        </Panel>
      </section>

      <Panel title="Preferencias">
        <ProfileForm
          displayName={profile.display_name}
          timezone={profile.timezone}
          weekStartsOn={profile.week_starts_on}
        />
      </Panel>

      <section id="datos" className="scroll-mt-24">
        <Panel title="Tus datos">
          <div className="grid gap-3">
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                Qué datos guarda Life OS y para qué
              </summary>
              <ul className="mt-3 grid list-disc gap-1.5 pl-5 text-muted-foreground">
                <li>
                  Tu email y preferencias (zona horaria, inicio de semana): para
                  iniciar sesión y saber qué es «hoy» y «esta semana».
                </li>
                <li>
                  Tus métricas, valores, objetivos, compromisos y revisiones:
                  son la base de tus scores. Solo tú puedes verlos.
                </li>
                <li>
                  Versiones de scoring: para que el historial conserve las
                  reglas con las que se calculó.
                </li>
                <li>
                  Integraciones que conectes: sus permisos, el estado de la
                  sincronización y los valores importados. Los tokens se guardan
                  cifrados y nunca llegan al navegador.
                </li>
                <li>
                  Análisis con IA (opcional): solo si lo pides en una revisión,
                  el resumen de esa semana se envía a Anthropic para redactarlo.
                  Nunca tu email ni tus notas.
                </li>
                <li>No se venden datos y no hay analítica de terceros.</li>
              </ul>
            </details>
            <p className="text-sm text-muted-foreground">
              Descarga todo lo que Life OS guarda de ti — métricas, valores,
              compromisos, revisiones y versiones de scoring — en un archivo
              JSON. Los tokens de integraciones nunca se incluyen.
            </p>
            {/* A plain link: the browser downloads the file. */}
            <a
              href="/settings/export"
              download
              className={buttonVariants({
                variant: "outline",
                size: "lg",
                className: "h-11 justify-self-start",
              })}
            >
              <DownloadIcon aria-hidden="true" />
              Exportar mis datos
            </a>
            <p className="text-sm text-muted-foreground">
              Para importar valores desde un CSV o conectar fuentes, ve a{" "}
              <Link
                href="/integrations"
                className="underline underline-offset-4"
              >
                Integraciones
              </Link>
              .
            </p>
          </div>
        </Panel>
      </section>
    </>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return (
    <dl className="grid gap-1">
      <dt className="text-xs text-muted-foreground">Email</dt>
      <dd className="text-sm font-medium">{user.email ?? "—"}</dd>
    </dl>
  );
}
