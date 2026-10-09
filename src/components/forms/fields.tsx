import type { ComponentProps, ReactNode } from "react";

import { Label } from "@/components/ui/label";
import { NativeSelect, Textarea } from "@/components/ui/native-select";

function describedBy(id: string, error?: string, hint?: ReactNode) {
  return (
    [error ? `${id}-error` : null, hint ? `${id}-hint` : null]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

function FieldFooter({
  id,
  error,
  hint,
}: {
  id: string;
  error?: string;
  hint?: ReactNode;
}) {
  return (
    <>
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
    </>
  );
}

export function SelectField({
  name,
  label,
  error,
  hint,
  children,
  idPrefix = "field",
  ...props
}: Omit<ComponentProps<"select">, "id" | "name"> & {
  name: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      >
        {children}
      </NativeSelect>
      <FieldFooter id={id} error={error} hint={hint} />
    </div>
  );
}

export function TextareaField({
  name,
  label,
  error,
  hint,
  idPrefix = "field",
  ...props
}: Omit<ComponentProps<"textarea">, "id" | "name"> & {
  name: string;
  label: string;
  error?: string;
  hint?: ReactNode;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, error, hint)}
        {...props}
      />
      <FieldFooter id={id} error={error} hint={hint} />
    </div>
  );
}

/** Groups related fields under a heading. */
export function FieldSet({
  legend,
  description,
  children,
}: {
  legend: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <fieldset className="grid gap-4 rounded-xl border p-4">
      <legend className="px-1 font-mono text-[0.7rem] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {legend}
      </legend>
      {description ? (
        <p className="-mt-2 text-sm text-muted-foreground">{description}</p>
      ) : null}
      {children}
    </fieldset>
  );
}
