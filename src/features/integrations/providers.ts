import type { Provider } from "@/lib/env/server-schema";

/** What each provider brings into Life OS (spec §16–19), in Spanish. */
export const PROVIDERS: {
  id: Provider;
  name: string;
  description: string;
  imports: string;
}[] = [
  {
    id: "strava",
    name: "Strava",
    description: "Tus actividades deportivas, sin registrarlas a mano.",
    imports: "Distancia, número de salidas, tiempo en movimiento y desnivel.",
  },
  {
    id: "google_calendar",
    name: "Google Calendar",
    description:
      "Bloques planificados (estudio, gimnasio, trabajo). Solo lectura.",
    imports:
      "Minutos planificados. Un evento no cuenta como hecho por existir: tú confirmas la ejecución.",
  },
  {
    id: "google_health",
    name: "Google Health",
    description: "Pasos, sueño y actividad (sucesor de la API de Fitbit).",
    imports: "Pasos, sueño, frecuencia cardiaca y ejercicio.",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Si hubo trabajo técnico en tus proyectos.",
    imports:
      "Días con actividad. Nunca como medida de habilidad: más commits no es mejor ingeniería.",
  },
];
