import { formatNumber } from "@/lib/format";
import { displayScore } from "@/lib/scoring";

/** One-line description of a score series, for screen readers. */
export function describeSeries(
  name: string,
  values: readonly (number | null)[],
): string {
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return `${name}: sin datos en este periodo.`;
  const show = (value: number) => formatNumber(displayScore(value), 0);
  return `${name}: de ${show(known[0])} a ${show(known.at(-1)!)}, mínimo ${show(Math.min(...known))}, máximo ${show(Math.max(...known))}.`;
}
