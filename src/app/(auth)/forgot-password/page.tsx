import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/features/auth/components/auth-card";
import { ForgotPasswordForm } from "@/features/auth/components/forgot-password-form";

export const metadata: Metadata = { title: "Recuperar acceso" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Recuperar acceso"
      description="Te enviaremos un enlace para elegir una contraseña nueva."
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          Volver a iniciar sesión
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
