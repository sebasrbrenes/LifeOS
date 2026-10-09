import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import type { ScoreIssue } from "@/lib/scoring";
import { cn } from "@/lib/utils";

import { describeIssue } from "../issue-copy";

export function IssueList({
  issues,
  className,
}: {
  issues: readonly ScoreIssue[];
  className?: string;
}) {
  if (issues.length === 0) return null;
  // The same explanation can arise from several metrics; show it once.
  const described = [
    ...new Map(
      issues.map((issue) => {
        const copy = describeIssue(issue);
        return [copy.text, copy] as const;
      }),
    ).values(),
  ];
  return (
    <ul className={cn("grid gap-1.5", className)}>
      {described.map(({ tone, text }) => {
        const Icon = tone === "warning" ? TriangleAlertIcon : InfoIcon;
        return (
          <li
            key={text}
            className={cn(
              "flex items-start gap-2 text-xs",
              tone === "warning" ? "text-amber-300" : "text-muted-foreground",
            )}
          >
            <Icon aria-hidden="true" className="mt-px size-3.5 shrink-0" />
            <span>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
