import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  AuthCard,
  AuthFormSkeleton,
} from "@/features/auth/components/auth-card";
import { LoginForm } from "@/features/auth/components/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Iniciar sesión"
      description="Vuelve a tu panel: dónde estás y qué atacar ahora."
      footer={
        <p>
          ¿No tienes cuenta?{" "}
          <Link
            href="/signup"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Crear cuenta
          </Link>
        </p>
      }
    >
      {/* Reads ?next and ?error, which are request-time data. */}
      <Suspense fallback={<AuthFormSkeleton />}>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
