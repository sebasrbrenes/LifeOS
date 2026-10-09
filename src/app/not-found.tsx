import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <p className="font-mono text-sm tracking-[0.2em] text-muted-foreground">
        404
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">No encontrado</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Esta página no existe o no tienes acceso a ella.
      </p>
      <Link
        href="/dashboard"
        className={buttonVariants({ variant: "outline", size: "lg" })}
      >
        Volver al dashboard
      </Link>
    </main>
  );
}
