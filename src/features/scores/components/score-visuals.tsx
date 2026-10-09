import { displayScore, type Freshness, type Rank } from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { FRESHNESS_LABELS } from "../../metrics/labels";

const RANK_STYLES: Record<Rank["key"], string> = {
  D: "border-border bg-muted text-muted-foreground",
  C: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  B: "border-teal-400/30 bg-teal-400/10 text-teal-300",
  A: "border-primary/40 bg-primary/10 text-primary",
  S: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  world_class: "border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-300",
  complete: "border-primary bg-primary text-primary-foreground",
};

export function RankBadge({
  rank,
  size = "md",
  className,
}: {
  rank: Rank | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  if (!rank) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md border font-mono font-bold tracking-wider uppercase",
        size === "sm" && "h-5 min-w-5 px-1 text-[0.65rem]",
        size === "md" && "h-6 min-w-6 px-1.5 text-xs",
        size === "lg" && "h-9 min-w-9 px-2 text-base",
        RANK_STYLES[rank.key],
        className,
      )}
      title={`Rango ${rank.label}`}
    >
      {rank.label}
    </span>
  );
}

/** Whole-number score, or a muted dash when there's no data. */
export function ScoreNumber({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  return (
    <span className={cn("font-mono tabular-nums", className)}>
      {score === null ? (
        <span className="text-muted-foreground/60">—</span>
      ) : (
        displayScore(score)
      )}
    </span>
  );
}

/** Radial gauge for a 0–100 score. */
export function ScoreRing({
  score,
  rank,
  label,
  size = 176,
}: {
  score: number | null;
  rank: Rank | null;
  label: string;
  size?: number;
}) {
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const shown = score === null ? null : displayScore(score);
  const offset = circumference * (1 - (shown ?? 0) / 100);

  return (
    <div
      role="img"
      aria-label={
        shown === null
          ? `${label}: sin datos`
          : `${label}: ${shown} de 100${rank ? `, rango ${rank.label}` : ""}`
      }
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden="true"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
          strokeDasharray={shown === null ? "4 8" : undefined}
        />
        {shown !== null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            className="stroke-primary transition-[stroke-dashoffset] duration-700"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        ) : null}
      </svg>
      <div
        className="absolute inset-0 grid place-content-center justify-items-center gap-1"
        aria-hidden="true"
      >
        <ScoreNumber
          score={score}
          className="text-5xl leading-none font-semibold"
        />
        {rank ? (
          <RankBadge rank={rank} />
        ) : (
          <span className="text-xs text-muted-foreground">sin datos</span>
        )}
      </div>
    </div>
  );
}

/** Horizontal 0–100 bar; striped and labelled when there's no data. */
export function ScoreBar({
  score,
  className,
}: {
  score: number | null;
  className?: string;
}) {
  const shown = score === null ? null : displayScore(score);
  return (
    <div
      aria-hidden="true"
      className={cn(
        "h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
    >
      {shown === null ? (
        <div className="h-full w-full bg-[repeating-linear-gradient(-45deg,transparent_0_6px,var(--border)_6px_8px)]" />
      ) : (
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700"
          style={{ width: `${shown}%` }}
        />
      )}
    </div>
  );
}

const FRESHNESS_STYLES: Record<Freshness, string> = {
  fresh: "text-primary",
  delayed: "text-amber-300",
  stale: "text-orange-400",
  missing: "text-muted-foreground",
  error: "text-destructive",
};

export function FreshnessBadge({ freshness }: { freshness: Freshness }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-xs",
        FRESHNESS_STYLES[freshness],
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {FRESHNESS_LABELS[freshness]}
    </span>
  );
}
