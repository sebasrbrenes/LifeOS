import type { Metadata } from "next";

import { Logo } from "@/components/brand/logo";
import { RetryButton } from "@/features/pwa/components/retry-button";

export const metadata: Metadata = { title: "Sin conexión" };

/**
 * Shown by the service worker when a page can't load offline. Static and
 * public: it never contains user data.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm content-center gap-6 px-6 text-center">
      <Logo className="justify-self-center" />
      <div className="grid gap-2">
        <h1 className="text-xl font-semibold">Sin conexión</h1>
        <p className="text-sm text-muted-foreground">
          Life OS necesita conexión para leer y guardar tus datos. No se ha
          perdido nada: vuelve a intentarlo cuando tengas red.
        </p>
      </div>
      <RetryButton />
    </main>
  );
}
