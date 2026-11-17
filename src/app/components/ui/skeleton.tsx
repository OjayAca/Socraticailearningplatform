import type { ComponentProps } from "react";
import { cn } from "./utils";

/**
 * Theme-preserving skeleton placeholder block for loading states.
 * Respects `prefers-reduced-motion` by disabling pulse animation when reduced motion is enabled.
 *
 * @param props - Standard div attributes with optional `className`.
 * @returns An `aria-hidden` skeleton placeholder element.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "animate-pulse motion-reduce:animate-none rounded-xl bg-slate-200/80 dark:bg-slate-800/80",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Layout-matched placeholder rows for loading session or record lists without layout shift.
 *
 * @param props - Optional row count and accessible loading announcement label.
 * @returns An accessible loading region (`role="status"`) containing skeleton rows.
 */
export function ListRowSkeleton({
  rows = 4,
  label = "Loading records",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className="divide-y divide-slate-200 dark:divide-slate-800"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid gap-3 px-5 py-4 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
        >
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-52 max-w-full" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      ))}
    </div>
  );
}
