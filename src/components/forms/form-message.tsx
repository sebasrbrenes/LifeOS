import { CircleAlertIcon, CircleCheckIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/** Form-level status message, announced to screen readers. */
export function FormMessage({
  status,
  children,
}: {
  status: "error" | "success";
  children: React.ReactNode;
}) {
  const Icon = status === "error" ? CircleAlertIcon : CircleCheckIcon;
  return (
    <div
      role={status === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm",
        status === "error"
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : "border-primary/30 bg-primary/10 text-foreground",
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <p>{children}</p>
    </div>
  );
}
