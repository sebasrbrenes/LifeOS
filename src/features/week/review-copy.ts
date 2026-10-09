import { formatDelta } from "@/lib/format";
import {
  LOW_EXECUTION_SCORE,
  displayScore,
  type WeeklyFocus,
} from "@/lib/scoring";

/** User-facing copy for the review's suggested next focus. */
export function focusCopy(focus: WeeklyFocus | null): string {
  if (!focus)
    return "Todas tus métricas con datos están en su objetivo. Valora subir los objetivos o añadir métricas.";
  switch (focus.kind) {
    case "plan_commitments":
      return "Define compromisos para la próxima semana: sin ellos no hay ejecución que medir.";
    case "execution":
      return `El cuello de botella es la ejecución (Week Score ${displayScore(focus.weekScore)}, por debajo de ${LOW_EXECUTION_SCORE}). Antes de cambiar de estrategia, ajusta los compromisos a lo que puedas cumplir.`;
    case "metric":
      return `Prioriza «${focus.gap.name}» (${focus.gap.categoryName}): está en ${displayScore(focus.gap.score)}/100 y llevarla a su objetivo sumaría ${formatDelta(focus.gap.potentialGain)} pts al Life Score.`;
    case "collect_data":
      return "Registra valores de tus métricas: sin datos no se puede medir tu estado.";
  }
}
