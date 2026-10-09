"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

import { displayScore } from "@/lib/scoring";
import { cn } from "@/lib/utils";

/**
 * History charts. Scores are 0–100 and missing data is a gap in the line,
 * never a drop to zero. Each chart has a text summary for screen readers.
 */

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const axisStyle = {
  fontSize: 11,
  fill: "var(--muted-foreground)",
};

function shortDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-muted-foreground">
        {typeof label === "string" ? shortDate(label) : null}
      </p>
      <ul className="grid gap-0.5">
        {payload.map((item) => (
          <li key={String(item.dataKey)} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: item.color }}
            />
            <span>{item.name}</span>
            <span className="ml-auto font-mono tabular-nums">
              {typeof item.value === "number" ? displayScore(item.value) : "—"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const chartStyle = { width: "100%", height: 240 } as const;

export function LifeScoreChart({
  points,
}: {
  points: { date: string; lifeScore: number | null }[];
}) {
  return (
    <LineChart
      data={points}
      responsive
      style={chartStyle}
      margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
    >
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={shortDate}
        tick={axisStyle}
        tickLine={false}
        axisLine={false}
        minTickGap={24}
      />
      <YAxis
        domain={[0, 100]}
        ticks={[0, 25, 50, 75, 100]}
        tick={axisStyle}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip content={ChartTooltip} />
      <Line
        type="monotone"
        dataKey="lifeScore"
        name="Life Score"
        stroke="var(--primary)"
        strokeWidth={2.5}
        dot={false}
        isAnimationActive={false}
      />
    </LineChart>
  );
}

export function CategoryTrendsChart({
  points,
  categories,
}: {
  points: { date: string; categories: Record<string, number | null> }[];
  categories: { id: string; name: string }[];
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const data = points.map((point) => ({
    date: point.date,
    ...point.categories,
  }));

  return (
    <div className="grid gap-3">
      <ul className="flex flex-wrap gap-2" aria-label="Mostrar categorías">
        {categories.map((category, index) => {
          const shown = !hidden.has(category.id);
          return (
            <li key={category.id}>
              <button
                type="button"
                aria-pressed={shown}
                onClick={() =>
                  setHidden((current) => {
                    const next = new Set(current);
                    if (shown) next.add(category.id);
                    else next.delete(category.id);
                    return next;
                  })
                }
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs transition-opacity",
                  !shown && "opacity-40",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-full"
                  style={{
                    background: CATEGORY_COLORS[index % CATEGORY_COLORS.length],
                  }}
                />
                {category.name}
              </button>
            </li>
          );
        })}
      </ul>
      <LineChart
        data={data}
        responsive
        style={chartStyle}
        margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
      >
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          minTickGap={24}
        />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={ChartTooltip} />
        {categories.map((category, index) =>
          hidden.has(category.id) ? null : (
            <Line
              key={category.id}
              type="monotone"
              dataKey={category.id}
              name={category.name}
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ),
        )}
      </LineChart>
    </div>
  );
}

export function WeekScoreChart({
  weeks,
}: {
  weeks: { weekStart: string; weekScore: number | null }[];
}) {
  return (
    <BarChart
      data={weeks}
      responsive
      style={{ width: "100%", height: 200 }}
      margin={{ top: 8, right: 8, bottom: 0, left: -24 }}
    >
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="weekStart"
        tickFormatter={shortDate}
        tick={axisStyle}
        tickLine={false}
        axisLine={false}
      />
      <YAxis
        domain={[0, 100]}
        ticks={[0, 50, 100]}
        tick={axisStyle}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip content={ChartTooltip} cursor={{ fill: "var(--accent)" }} />
      <Bar
        dataKey="weekScore"
        name="Week Score"
        fill="var(--chart-2)"
        radius={[4, 4, 0, 0]}
        isAnimationActive={false}
      />
    </BarChart>
  );
}
