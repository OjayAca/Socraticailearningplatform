"use client";

import type { ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { Link } from "react-router";
import { Skeleton } from "../ui/skeleton";
import type { TimestampLike } from "./admin-utils";

/** Props for {@link PageTitle}. */
export interface PageTitleProps {
  /** Primary page heading text. */
  title: string;
  /** Supporting subtitle explaining the page scope. */
  description: string;
  /** Optional right-aligned header actions or controls. */
  actions?: ReactNode;
  /** Optional additional wrapper classes. */
  className?: string;
}

/**
 * Renders a consistent administrator page heading and description.
 *
 * @param props - See {@link PageTitleProps}.
 * @returns The rendered page header block.
 */
export function PageTitle({
  title,
  description,
  actions,
  className = "",
}: PageTitleProps) {
  return (
    <div
      className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between ${className}`.trim()}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">
          {description}
        </p>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Props for {@link AdminStat}. */
export interface AdminStatProps {
  /** Uppercase metric label displayed below the icon badge. */
  label: string;
  /** Metric value node (numeric count, formatted string, or fallback). */
  value: ReactNode;
  /** Shows a skeleton placeholder when data is loading. */
  loading?: boolean;
  /** Lucide icon component displayed in the metric badge. */
  Icon: LucideIcon;
  /** Tailwind background and text classes for the icon badge. */
  iconClassName: string;
  /** Optional supporting caption below the value. */
  helperText?: string;
}

/**
 * Renders an administrator overview statistic card with loading skeleton support.
 *
 * @param props - See {@link AdminStatProps}.
 * @returns Rendered metric card.
 */
export function AdminStat({
  label,
  value,
  loading = false,
  Icon,
  iconClassName,
  helperText,
}: AdminStatProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">
        {loading ? (
          <>
            <span className="sr-only">Loading…</span>
            <Skeleton className="mt-1 h-8 w-16" />
          </>
        ) : (
          value
        )}
      </div>
      {helperText && (
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{helperText}</p>
      )}
    </div>
  );
}

/** Props for {@link Action}. */
export interface ActionProps {
  /** Click handler invoked when the action button is pressed. */
  onClick: () => void;
  /** Visible label or content of the action button. */
  children: ReactNode;
  /** Disables interaction while another request is running or prerequisites are unmet. */
  disabled?: boolean;
  /** Displays an inline spinner when the action is currently executing. */
  busy?: boolean;
  /** Optional explicit accessible label overriding the text content. */
  ariaLabel?: string;
  /** Optional additional utility classes. */
  className?: string;
}

/**
 * Renders a compact, 44px-minimum-height administrator table/row action button.
 *
 * @param props - See {@link ActionProps}.
 * @returns The rendered button element.
 */
export function Action({
  onClick,
  children,
  disabled = false,
  busy = false,
  ariaLabel,
  className = "",
}: ActionProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold capitalize text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white ${className}`.trim()}
    >
      {busy && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
      <span>{children}</span>
    </button>
  );
}

/** Props for {@link JsonTable}. */
export interface JsonTableProps {
  /** Tabular row records whose keys define the rendered column headers. */
  rows: ReadonlyArray<Record<string, unknown>>;
  /** Empty-state message displayed when `rows` is empty. */
  emptyMessage?: string;
  /** Accessible region label for horizontal table scrolling. */
  ariaLabel?: string;
}

/**
 * Renders an accessible, horizontally scrollable table from homogeneous record rows.
 *
 * @param props - See {@link JsonTableProps}.
 * @returns The rendered table card or empty-state notice.
 */
export function JsonTable({
  rows,
  emptyMessage = "Generate a report to view results.",
  ariaLabel = "Report results table (scroll horizontally)",
}: JsonTableProps) {
  if (!rows.length) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
        {emptyMessage}
      </div>
    );
  }

  const headers = Object.keys(rows[0]);

  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div
        role="region"
        aria-label={ariaLabel}
        tabIndex={0}
        className="table-scroll max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-500"
      >
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            <tr>
              {headers.map((header) => (
                <th
                  key={header}
                  className="whitespace-nowrap p-3.5 font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row, index) => (
              <tr key={index} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                {headers.map((header) => (
                  <td
                    key={header}
                    className="max-w-xs whitespace-normal break-words p-3.5 text-slate-800 dark:text-slate-200"
                  >
                    {String(row[header] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Structured audit or AI log entry rendered in administrator log feeds. */
export interface LogEntry {
  id: string;
  action?: string;
  operation?: string;
  reason?: string;
  target?: string;
  sessionId?: string;
  correlationId?: string;
  createdAt?: TimestampLike;
  [key: string]: unknown;
}

/** Shape of a released worked solution displayed during session review. */
interface ReleasedSolution {
  method?: string;
  steps?: ReadonlyArray<string>;
  answer?: string;
  [key: string]: unknown;
}

/** Props for {@link SolutionDetails}. */
export interface SolutionDetailsProps {
  /** Solution payload stored on a reviewed or completed session. */
  solution: ReleasedSolution;
}

/**
 * Renders the released worked solution summary inside administrator session review.
 *
 * @param props - See {@link SolutionDetailsProps}.
 * @returns The rendered solution card.
 */
export function SolutionDetails({ solution }: SolutionDetailsProps) {
  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        Released solution
      </p>
      <p className="mt-2 text-sm">
        <strong>Method:</strong> {solution.method ?? "—"}
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {(solution.steps ?? []).map((step, index) => (
          <li key={`${index}-${step}`}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-sm">
        <strong>Answer:</strong> {solution.answer ?? "—"}
      </p>
    </div>
  );
}

/** Props for {@link AdminSearchInput}. */
export interface AdminSearchInputProps {
  /** Controlled search query value. */
  value: string;
  /** Change handler invoked with the updated query string. */
  onChange: (value: string) => void;
  /** Placeholder text shown when empty. */
  placeholder: string;
  /** Accessible label for the search input. */
  ariaLabel: string;
  /** Accessible label for the inline clear button. */
  clearAriaLabel?: string;
  /** Optional wrapper classes. */
  className?: string;
}

/**
 * Renders a shared search bar with leading search icon and inline clear button.
 *
 * @param props - See {@link AdminSearchInputProps}.
 * @returns The rendered search input container.
 */
export function AdminSearchInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  clearAriaLabel = "Clear search",
  className = "",
}: AdminSearchInputProps) {
  return (
    <div className={`relative ${className}`.trim()}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
      <input
        value={value}
        aria-label={ariaLabel}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-base text-slate-950 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      />
      {value && (
        <button
          type="button"
          aria-label={clearAriaLabel}
          onClick={() => onChange("")}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-slate-200"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/** Props for {@link AdminFilterPill}. */
export interface AdminFilterPillProps {
  /** Whether the filter option is currently selected. */
  active: boolean;
  /** Click handler to activate or toggle this filter. */
  onClick: () => void;
  /** Filter pill label. */
  children: ReactNode;
  /** Visual inactive background variant. */
  variant?: "surface" | "muted";
}

/**
 * Renders a filter toggle pill button with `aria-pressed` state.
 *
 * @param props - See {@link AdminFilterPillProps}.
 * @returns The rendered filter button.
 */
export function AdminFilterPill({
  active,
  onClick,
  children,
  variant = "surface",
}: AdminFilterPillProps) {
  const inactiveClass =
    variant === "muted"
      ? "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 rounded-xl border px-3 py-1.5 text-xs font-semibold capitalize transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
        active
          ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-950/50 dark:text-indigo-200"
          : inactiveClass
      }`}
    >
      {children}
    </button>
  );
}

/** Tab item definition for {@link AdminTabs}. */
export interface AdminTabItem {
  /** Unique identifier of the tab. */
  id: string;
  /** Visible tab label. */
  label: string;
  /** Optional route path when tabs navigate across URLs. */
  href?: string;
  /** Optional trailing badge node (for example a count). */
  badge?: ReactNode;
}

/** Props for {@link AdminTabs}. */
export interface AdminTabsProps {
  /** Tab definitions to render. */
  items: ReadonlyArray<AdminTabItem>;
  /** Currently active tab identifier. */
  activeId: string;
  /** Selection callback invoked for button-mode tabs without `href`. */
  onSelect?: (id: string) => void;
  /** Accessible label for the tab strip container. */
  ariaLabel?: string;
  /** Optional additional wrapper classes. */
  className?: string;
}

/**
 * Renders a shared pill-style tab bar supporting both router links and controlled tab buttons.
 *
 * @param props - See {@link AdminTabsProps}.
 * @returns The rendered tab navigation strip.
 */
export function AdminTabs({
  items,
  activeId,
  onSelect,
  ariaLabel = "Section tabs",
  className = "",
}: AdminTabsProps) {
  return (
    <div
      role="navigation"
      aria-label={ariaLabel}
      className={`flex flex-wrap gap-2 ${className}`.trim()}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        const tabClass = `inline-flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
          isActive
            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
        }`;

        if (item.href) {
          return (
            <Link
              key={item.id}
              to={item.href}
              aria-current={isActive ? "page" : undefined}
              className={tabClass}
            >
              <span>{item.label}</span>
              {item.badge}
            </Link>
          );
        }

        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={isActive}
            onClick={() => onSelect?.(item.id)}
            className={tabClass}
          >
            <span>{item.label}</span>
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}

/** Props for {@link AdminPagination}. */
export interface AdminPaginationProps {
  /** Current 1-based page number. */
  page: number;
  /** Number of records per page. */
  pageSize: number;
  /** Total count of matching records across all pages. */
  totalItems: number;
  /** Invoked with the requested 1-based page index. */
  onPageChange: (nextPage: number) => void;
  /** Singular/plural noun describing the paginated items. */
  itemLabel?: string;
  /** Optional wrapper classes. */
  className?: string;
}

/**
 * Renders accessible previous/next pagination controls with range summary.
 *
 * @param props - See {@link AdminPaginationProps}.
 * @returns The rendered pagination bar, or `null` when there are no items.
 */
export function AdminPagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  itemLabel = "records",
  className = "",
}: AdminPaginationProps) {
  if (totalItems <= 0) return null;

  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const start = (currentPage - 1) * safePageSize + 1;
  const end = Math.min(totalItems, currentPage * safePageSize);

  return (
    <nav
      aria-label="Pagination"
      className={`mt-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900/80 ${className}`.trim()}
    >
      <p className="font-medium text-slate-600 dark:text-slate-400">
        Showing <span className="font-bold text-slate-900 dark:text-slate-100">{start}–{end}</span>{" "}
        of <span className="font-bold text-slate-900 dark:text-slate-100">{totalItems}</span>{" "}
        {itemLabel}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          aria-label="Previous page"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ChevronLeft aria-hidden="true" className="h-4 w-4" />
          Previous
        </button>
        <span className="px-2 font-semibold text-slate-700 dark:text-slate-300">
          Page {currentPage} of {totalPages}
        </span>
        <button
          type="button"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          aria-label="Next page"
          className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          Next
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
