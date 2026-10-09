import { cn } from "@/lib/utils";

/** Life OS wordmark: a rising-bars mark plus the product name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 font-mono text-sm font-semibold tracking-[0.2em] uppercase",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-5 text-primary"
        fill="currentColor"
      >
        <rect x="1" y="9" width="3" height="6" rx="1" opacity="0.45" />
        <rect x="6.5" y="5" width="3" height="10" rx="1" opacity="0.7" />
        <rect x="12" y="1" width="3" height="14" rx="1" />
      </svg>
      Life OS
    </span>
  );
}
