import type { Metadata } from "next";
import { Suspense } from "react";

import {
  AuthCard,
  AuthFormSkeleton,
} from "@/features/auth/components/auth-card";
import { ResetPasswordForm } from "@/features/auth/components/reset-password-form";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Nueva contraseña" };

/**
 * Reached from the recovery email via /auth/confirm, which establishes a
 * short-lived session. The route is protected (not guest-only).
 */
export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Nueva contraseña"
      description="Elige una contraseña nueva para tu cuenta."
    >
      <Suspense fallback={<AuthFormSkeleton />}>
        <AuthorizedResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}

async function AuthorizedResetPasswordForm() {
  await requireUser();
  return <ResetPasswordForm />;
}
