import { ClipboardCheckIcon } from "lucide-react";
import Link from "next/link";

import { addDays } from "@/lib/scoring";
import { formatWeekRange } from "@/lib/format";

/** Weeks that ended with commitments and still need their review. */
export function PendingReviewsBanner({ weeks }: { weeks: string[] }) {
  if (weeks.length === 0) return null;
  return (
    <section
      aria-label="Semanas por cerrar"
      className="grid gap-2 rounded-2xl border border-amber-300/40 bg-amber-300/5 p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <ClipboardCheckIcon aria-hidden="true" className="size-4" />
        {weeks.length === 1
          ? "Tienes una semana por cerrar"
          : `Tienes ${weeks.length} semanas por cerrar`}
      </p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {weeks.map((week) => (
          <li key={week}>
            <Link
              href={`/review/${week}`}
              className="underline underline-offset-4 hover:text-primary"
            >
              {formatWeekRange(week, addDays(week, 6))}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
