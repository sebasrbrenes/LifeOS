import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { SignupForm } from "@/features/auth/components/signup-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Crear cuenta"
      description="Mide tu estado y tu ejecución por separado. Compite contra tu yo de ayer."
      footer={
        <p>
          ¿Ya tienes cuenta?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Iniciar sesión
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
