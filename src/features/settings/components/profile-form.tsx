"use client";

import { useState, useSyncExternalStore } from "react";

import { SelectField } from "@/components/forms/fields";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { useFormAction } from "@/components/forms/use-form-action";
import { Button } from "@/components/ui/button";

import { saveProfileSettings } from "../actions";
import {
  clientTimeZoneOptions,
  serverTimeZoneOptions,
} from "../time-zone-options";

const WEEKDAYS = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
];
const noSubscription = () => () => {};

function useDeviceTimeZone() {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    () => "",
  );
}

function useTimeZones(current: string) {
  return useSyncExternalStore(
    noSubscription,
    () => clientTimeZoneOptions(current),
    () => serverTimeZoneOptions(current),
  );
}

export function ProfileForm({
  displayName,
  timezone,
  weekStartsOn,
}: {
  displayName: string | null;
  timezone: string;
  weekStartsOn: number;
}) {
  const { state, pending, formRef, onSubmit } =
    useFormAction(saveProfileSettings);
  const [zone, setZone] = useState(timezone);
  const deviceZone = useDeviceTimeZone();
  const zones = useTimeZones(zone);
  const errors = state.fieldErrors ?? {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4" noValidate>
      {state.message ? (
        <FormMessage status={state.status === "error" ? "error" : "success"}>
          {state.message}
        </FormMessage>
      ) : null}
      <FormField
        name="displayName"
        label="Nombre"
        defaultValue={displayName ?? ""}
        maxLength={80}
        error={errors.displayName}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <SelectField
            name="timezone"
            label="Zona horaria"
            value={zone}
            onChange={(event) => setZone(event.currentTarget.value)}
            hint="Define qué es “hoy” y los periodos de cada métrica."
            error={errors.timezone}
          >
            {zones.map((z) => (
              <option key={z} value={z}>
                {z.replaceAll("_", " ")}
              </option>
            ))}
          </SelectField>
          {deviceZone && deviceZone !== zone ? (
            <Button
              type="button"
              variant="link"
              className="h-auto justify-self-start p-0 text-xs"
              onClick={() => setZone(deviceZone)}
            >
              Usar la de este dispositivo ({deviceZone.replaceAll("_", " ")})
            </Button>
          ) : null}
        </div>
        <SelectField
          name="weekStartsOn"
          label="La semana empieza el"
          hint="Aplica a las semanas nuevas; las ya planificadas conservan sus fechas."
          defaultValue={String(weekStartsOn)}
          error={errors.weekStartsOn}
        >
          {WEEKDAYS.map((day, index) => (
            <option key={day} value={index}>
              {day}
            </option>
          ))}
        </SelectField>
      </div>
      <SubmitButton
        pending={pending}
        pendingLabel="Guardando…"
        className="sm:w-auto sm:justify-self-start sm:px-6"
      >
        Guardar preferencias
      </SubmitButton>
    </form>
  );
}
