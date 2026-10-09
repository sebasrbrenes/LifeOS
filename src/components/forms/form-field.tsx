import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type FormFieldProps = Omit<ComponentProps<"input">, "id" | "name"> & {
  name: string;
  label: string;
  error?: string;
  hint?: string;
  /** Distinguishes ids when several forms share field names. */
  idPrefix?: string;
};

/**
 * Labelled input with an accessible error/hint. Touch-sized (44px) so
 * forms are comfortable on an iPhone.
 */
export function FormField({
  name,
  label,
  error,
  hint,
  className,
  idPrefix = "field",
  ...inputProps
}: FormFieldProps) {
  const id = `${idPrefix}-${name}`;
  const describedBy =
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn("h-11", className)}
        {...inputProps}
      />
      {hint && !error ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
