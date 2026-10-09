import { formatDelta, formatNumber } from "@/lib/format";
import type { CategoryDiagnostic } from "@/lib/scoring";

/** User-facing copy for a strategy diagnostic (spec §11). */
export function diagnosticCopy(diagnostic: CategoryDiagnostic): {
  title: string;
  body: string;
} {
  const execution = `${formatNumber(diagnostic.execution, 0)} %`;
  const change = `${formatDelta(diagnostic.outcomeChange)} pts`;
  const weeks = `${diagnostic.weeks} semanas`;
  switch (diagnostic.code) {
    case "high_execution_low_outcome":
      return {
        title: `${diagnostic.categoryName}: buena ejecución, poco resultado`,
        body: `Completaste el ${execution} de tus compromisos de ${diagnostic.categoryName} en ${weeks}, pero la categoría solo cambió ${change}. Revisa la estrategia, los objetivos o cómo lo mides.`,
      };
    case "execution_bottleneck":
      return {
        title: `${diagnostic.categoryName}: la ejecución es el cuello de botella`,
        body: `Completaste el ${execution} de tus compromisos de ${diagnostic.categoryName} en ${weeks} y la categoría no mejora (${change}). Antes de cambiar de estrategia, ajusta los compromisos a lo que puedas cumplir.`,
      };
  }
}
