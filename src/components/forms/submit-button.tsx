import { Loader2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SubmitButton({
  pending,
  children,
  pendingLabel,
  className,
}: {
  pending: boolean;
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
}) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pending}
      aria-busy={pending}
      className={cn("h-11 w-full text-sm font-semibold", className)}
    >
      {pending ? (
        <>
          <Loader2Icon aria-hidden="true" className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
