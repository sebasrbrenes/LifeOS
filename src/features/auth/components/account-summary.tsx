import { requireUser } from "@/lib/auth/session";

/** Signed-in identity for the sidebar footer. Reads the session. */
export async function AccountSummary() {
  const user = await requireUser();
  return (
    <p
      className="truncate px-3 text-xs text-muted-foreground"
      title={user.email ?? undefined}
    >
      {user.email ?? "Cuenta sin email"}
    </p>
  );
}
