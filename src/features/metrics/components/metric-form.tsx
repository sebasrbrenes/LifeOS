"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useId, useState } from "react";

import {
  FieldSet,
  SelectField,
  TextareaField,
} from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";
import {
  METRIC_AGGREGATIONS,
  METRIC_DIRECTIONS,
  METRIC_PERIODS,
  type MetricAggregation,
  type MetricDirection,
  type MetricPeriod,
} from "@/lib/scoring";

import { AGGREGATION_LABELS, DIRECTION_LABELS, PERIOD_LABELS } from "../labels";
import { metricFormDefaults } from "../metric-form";
import type { MetricTemplate } from "../templates";

export type MetricFormInitial = {
  name: string;
  categoryId: string;
  description: string;
  unit: string;
  direction: MetricDirection;
  period: MetricPeriod;
  aggregation: MetricAggregation;
  weight: string;
  config: unknown;
};

type CategoryOption = { id: string; key: string; name: string };
type MetricOption = { key: string; name: string };

const BLANK: MetricFormInitial = {
  name: "",
  categoryId: "",
  description: "",
  unit: "",
  direction: "higher_is_better",
  period: "weekly",
  aggregation: "sum",
  weight: "1",
  config: {},
};

function fromTemplate(
  template: MetricTemplate,
  categories: CategoryOption[],
): MetricFormInitial {
  return {
    name: template.name,
    categoryId:
      categories.find((c) => c.key === template.categoryKey)?.id ?? "",
    description: template.description,
    unit: template.unit ?? "",
    direction: template.direction,
    period: template.period,
    aggregation: template.aggregation,
    weight: "1",
    config: template.config,
  };
}

/** Editable rows for milestone ladders and custom curves. */
function RowsEditor({
  prefix,
  columns,
  initial,
  addLabel,
  error,
}: {
  prefix: "milestones" | "points";
  columns: {
    key: string;
    label: string;
    type: "decimal" | "text";
    placeholder?: string;
  }[];
  initial: Record<string, unknown>[];
  addLabel: string;
  error?: string;
}) {
  const baseId = useId();
  const [rows, setRows] = useState(() =>
    (initial.length > 0 ? initial : [{}, {}]).map((values, index) => ({
      id: index,
      values,
    })),
  );
  const nextId = () => Math.max(-1, ...rows.map((r) => r.id)) + 1;

  return (
    <div className="grid gap-2">
      <div className="grid gap-2">
        {rows.map((row, index) => (
          <div key={row.id} className="flex items-end gap-2">
            {columns.map((column) => {
              const fieldId = `${baseId}-${row.id}-${column.key}`;
              return (
                <div
                  key={column.key}
                  className={
                    column.type === "text"
                      ? "grid flex-[2] gap-1"
                      : "grid flex-1 gap-1"
                  }
                >
                  <label
                    htmlFor={fieldId}
                    className={
                      index === 0 ? "text-xs text-muted-foreground" : "sr-only"
                    }
                  >
                    {column.label}
                  </label>
                  <input
                    id={fieldId}
                    name={`${prefix}.${index}.${column.key}`}
                    defaultValue={
                      row.values[column.key] === undefined
                        ? ""
                        : String(row.values[column.key])
                    }
                    inputMode={
                      column.type === "decimal" ? "decimal" : undefined
                    }
                    placeholder={column.placeholder}
                    aria-label={
                      index === 0 ? undefined : `${column.label} ${index + 1}`
                    }
                    className="h-11 w-full min-w-0 rounded-lg border border-input bg-input/30 px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
                  />
                </div>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="size-11"
              aria-label={`Quitar fila ${index + 1}`}
              onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
              disabled={rows.length <= 1}
            >
              <Trash2Icon aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <div>
        <Button
          type="button"
          variant="outline"
          onClick={() => setRows([...rows, { id: nextId(), values: {} }])}
        >
          <PlusIcon aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

function ScoringFields({
  direction,
  defaults,
  config,
  unit,
  otherMetrics,
  errors,
}: {
  direction: MetricDirection;
  defaults: Record<string, string>;
  config: Record<string, unknown>;
  unit: string;
  otherMetrics: MetricOption[];
  errors: Partial<Record<string, string>>;
}) {
  const suffix = unit ? ` (${unit})` : "";
  const number = (
    name: string,
    label: string,
    hint?: string,
    required = false,
  ) => (
    <FormField
      name={name}
      label={label}
      inputMode="decimal"
      defaultValue={defaults[name]}
      required={required}
      hint={hint}
      error={errors[name]}
    />
  );

  switch (direction) {
    case "higher_is_better":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {number(
            "target",
            `Objetivo${suffix}`,
            "Este valor puntúa 100.",
            true,
          )}
          {number(
            "baseline",
            `Valor base${suffix}`,
            "Puntúa 0. Por defecto, 0.",
          )}
        </div>
      );
    case "lower_is_better":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          {number(
            "target",
            `Objetivo${suffix}`,
            "Este valor o menos puntúa 100.",
            true,
          )}
          {number(
            "worst",
            `Peor valor${suffix}`,
            "Opcional: puntúa 0. Sin él, puntuación = objetivo ÷ valor.",
          )}
        </div>
      );
    case "target_range":
      return (
        <div className="grid gap-4 sm:grid-cols-3">
          {number("targetMin", `Mínimo ideal${suffix}`, undefined, true)}
          {number("targetMax", `Máximo ideal${suffix}`, undefined, true)}
          {number(
            "tolerance",
            `Tolerancia${suffix}`,
            "Distancia fuera del rango que llega a 0. Por defecto, el ancho del rango.",
          )}
        </div>
      );
    case "boolean":
      return (
        <p className="text-sm text-muted-foreground">
          Sí puntúa 100; No puntúa 0.
        </p>
      );
    case "ratio":
      return (
        <div className="grid gap-4">
          {number(
            "ratioTarget",
            "Objetivo (%)",
            "Este porcentaje o más puntúa 100.",
            true,
          )}
          <p className="text-sm text-muted-foreground">
            Opcional: calcula el porcentaje a partir de otras dos métricas (p.
            ej. respuestas positivas ÷ prospectos contactados). Si no,
            registrarás el porcentaje directamente.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            <SelectField
              name="numerator"
              label="Numerador"
              defaultValue={defaults.numerator}
              error={errors.numerator}
            >
              <option value="">— Registro directo —</option>
              {otherMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </SelectField>
            <SelectField
              name="denominator"
              label="Denominador"
              defaultValue={defaults.denominator}
              error={errors.denominator}
            >
              <option value="">— Registro directo —</option>
              {otherMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.name}
                </option>
              ))}
            </SelectField>
            {number(
              "minDenominator",
              "Muestra mínima",
              "Por debajo, la métrica queda sin datos.",
            )}
          </div>
        </div>
      );
    case "milestone":
      return (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Cada nivel tiene un valor (lo que registrarás), una puntuación 0–100
            y un nombre. Se puntúa el nivel más alto alcanzado.
          </p>
          <RowsEditor
            prefix="milestones"
            initial={(config.milestones as Record<string, unknown>[]) ?? []}
            columns={[
              {
                key: "value",
                label: "Valor",
                type: "decimal",
                placeholder: "0",
              },
              {
                key: "score",
                label: "Puntos",
                type: "decimal",
                placeholder: "0–100",
              },
              {
                key: "label",
                label: "Nombre",
                type: "text",
                placeholder: "Aprendiendo fundamentos",
              },
            ]}
            addLabel="Añadir nivel"
            error={errors.milestones}
          />
        </div>
      );
    case "custom":
      return (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">
            Define puntos (valor → puntuación). Entre puntos se interpola en
            línea recta.
          </p>
          <RowsEditor
            prefix="points"
            initial={(config.points as Record<string, unknown>[]) ?? []}
            columns={[
              { key: "value", label: "Valor", type: "decimal" },
              { key: "score", label: "Puntos (0–100)", type: "decimal" },
            ]}
            addLabel="Añadir punto"
            error={errors.points}
          />
        </div>
      );
  }
}

function MetricFields({
  initial,
  categories,
  otherMetrics,
  errors,
}: {
  initial: MetricFormInitial;
  categories: CategoryOption[];
  otherMetrics: MetricOption[];
  errors: Partial<Record<string, string>>;
}) {
  const [direction, setDirection] = useState(initial.direction);
  const [unit, setUnit] = useState(initial.unit);
  const defaults = metricFormDefaults({
    direction: initial.direction,
    config: initial.config,
  });
  const sameDirection = direction === initial.direction;
  const config = sameDirection
    ? ((initial.config ?? {}) as Record<string, unknown>)
    : {};

  return (
    <div className="grid gap-5">
      <FieldSet legend="Qué mides">
        <FormField
          name="name"
          label="Nombre"
          defaultValue={initial.name}
          required
          maxLength={80}
          error={errors.name}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="categoryId"
            label="Categoría"
            defaultValue={initial.categoryId}
            required
            error={errors.categoryId}
          >
            <option value="" disabled>
              Elige una categoría
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectField>
          <FormField
            name="unit"
            label="Unidad"
            defaultValue={initial.unit}
            onChange={(event) => setUnit(event.currentTarget.value)}
            placeholder="km, h, $, sesiones…"
            maxLength={20}
            error={errors.unit}
          />
        </div>
        <TextareaField
          name="description"
          label="Descripción (opcional)"
          defaultValue={initial.description}
          maxLength={500}
          rows={2}
          error={errors.description}
        />
      </FieldSet>

      <FieldSet
        legend="Cómo se cuenta"
        description="Qué registros entran y cómo se combinan."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            name="period"
            label="Periodo evaluado"
            defaultValue={initial.period}
            error={errors.period}
            hint="Ventana móvil que termina hoy, en tu zona horaria."
          >
            {METRIC_PERIODS.map((p) => (
              <option key={p} value={p}>
                {PERIOD_LABELS[p]}
              </option>
            ))}
          </SelectField>
          <SelectField
            name="aggregation"
            label="Combinar registros"
            defaultValue={initial.aggregation}
            error={errors.aggregation}
          >
            {METRIC_AGGREGATIONS.map((a) => (
              <option key={a} value={a}>
                {AGGREGATION_LABELS[a].label} — {AGGREGATION_LABELS[a].hint}
              </option>
            ))}
          </SelectField>
        </div>
      </FieldSet>

      <FieldSet
        legend="Cómo puntúa"
        description="Qué valor equivale a 100. Nunca se superan 100 puntos."
      >
        <SelectField
          name="direction"
          label="Tipo"
          value={direction}
          onChange={(event) =>
            setDirection(event.currentTarget.value as MetricDirection)
          }
          hint={DIRECTION_LABELS[direction].hint}
          error={errors.direction}
        >
          {METRIC_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {DIRECTION_LABELS[d].label}
            </option>
          ))}
        </SelectField>
        <ScoringFields
          key={direction}
          direction={direction}
          defaults={sameDirection ? defaults : {}}
          config={config}
          unit={unit}
          otherMetrics={otherMetrics}
          errors={errors}
        />
      </FieldSet>

      <FieldSet legend="Importancia">
        <FormField
          name="weight"
          label="Peso dentro de la categoría"
          inputMode="decimal"
          defaultValue={initial.weight}
          required
          hint="Relativo a las demás métricas de la categoría: 2 pesa el doble que 1."
          error={errors.weight}
        />
        <details className="group">
          <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
            Avanzado
          </summary>
          <div className="mt-3">
            <SelectField
              name="emptyWindow"
              label="Si no hay registros en el periodo"
              defaultValue={defaults.emptyWindow}
              hint="Automático: en sumas y conteos cuenta como 0 (si ya registraste antes); en el resto, sin datos."
              error={errors.emptyWindow}
            >
              <option value="">Automático</option>
              <option value="zero">Cuenta como 0</option>
              <option value="missing">Sin datos (no cuenta)</option>
            </SelectField>
          </div>
        </details>
      </FieldSet>
    </div>
  );
}

export function MetricForm({
  action,
  categories,
  otherMetrics,
  initial,
  templates,
  submitLabel,
  pendingLabel,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  categories: CategoryOption[];
  otherMetrics: MetricOption[];
  initial?: MetricFormInitial;
  templates?: readonly MetricTemplate[];
  submitLabel: string;
  pendingLabel: string;
}) {
  const { state, pending, formRef, onSubmit } = useFormAction(action);
  const [templateId, setTemplateId] = useState("");
  const template = templates?.find((t) => t.id === templateId);
  const start = template
    ? fromTemplate(template, categories)
    : (initial ?? BLANK);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-5" noValidate>
      {templates ? (
        <div className="rounded-xl border border-dashed p-4">
          <SelectField
            name="template"
            label="Empezar desde una plantilla"
            value={templateId}
            onChange={(event) => setTemplateId(event.currentTarget.value)}
            hint="Rellena el formulario con valores sugeridos. Ajusta los objetivos a tu realidad."
          >
            <option value="">En blanco</option>
            {categories.map((category) => {
              const options = templates.filter(
                (t) => t.categoryKey === category.key,
              );
              return options.length ? (
                <optgroup key={category.id} label={category.name}>
                  {options.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </SelectField>
        </div>
      ) : null}

      {state.status === "error" && state.message ? (
        <FormMessage status="error">{state.message}</FormMessage>
      ) : null}
      {state.status === "error" &&
      !state.message &&
      Object.keys(errors).length > 0 ? (
        <FormMessage status="error">Revisa los campos marcados.</FormMessage>
      ) : null}
      {state.status === "success" && state.message ? (
        <FormMessage status="success">{state.message}</FormMessage>
      ) : null}

      <MetricFields
        key={templateId}
        initial={start}
        categories={categories}
        otherMetrics={otherMetrics}
        errors={errors}
      />

      <SubmitButton
        pending={pending}
        pendingLabel={pendingLabel}
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
