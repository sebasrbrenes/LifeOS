import { LogOutIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

import { signOut } from "../actions";

/** Plain form submit so sign-out works even before JavaScript loads. */
export function SignOutButton({
  variant = "ghost",
  className,
}: {
  variant?: "ghost" | "outline";
  className?: string;
}) {
  return (
    <form action={signOut}>
      <Button type="submit" variant={variant} className={className}>
        <LogOutIcon aria-hidden="true" />
        Cerrar sesión
      </Button>
    </form>
  );
}
