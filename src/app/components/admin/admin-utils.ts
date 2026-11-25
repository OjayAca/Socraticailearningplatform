/** Supported timestamp input shapes from Firestore or JavaScript runtimes. */
export type TimestampLike =
  | number
  | string
  | Date
  | { toDate: () => Date }
  | { toMillis: () => number }
  | null
  | undefined;

/** Optional academic profile fields indexed by administrator user search. */
export interface SearchableAcademicProfile {
  studentNumber?: string;
  course?: string;
  yearLevel?: string;
  section?: string;
}

/** Minimal user record shape accepted by {@link searchableUser}. */
export interface SearchableUserRecord {
  displayName?: unknown;
  email?: unknown;
  role?: unknown;
  status?: unknown;
  academicProfile?: SearchableAcademicProfile | null;
}

/** Result returned by {@link paginateSlice}. */
export interface PaginationResult<T> {
  /** Items belonging to the clamped current page. */
  items: ReadonlyArray<T>;
  /** 1-based clamped page index. */
  page: number;
  /** Total number of pages (at least 1). */
  totalPages: number;
  /** Total number of input items. */
  totalItems: number;
  /** 1-based index of the first item on the current page (0 when empty). */
  startIndex: number;
  /** 1-based index of the last item on the current page (0 when empty). */
  endIndex: number;
}

/**
 * Maps a session, account, or content status string to Tailwind badge classes.
 *
 * @param status - Domain status string (for example `active`, `submitted`, `deactivated`).
 * @returns Tailwind class string for pill styling.
 */
export function statusBadgeClass(status?: string): string {
  switch (status) {
    case "completed":
    case "reviewed":
    case "approved":
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "submitted":
    case "pending_validation":
    case "suspended":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
    case "deactivated":
    case "rejected":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

/**
 * Computes a safe 1-based page slice from an array of items.
 *
 * @param items - Full filtered item list.
 * @param page - Requested 1-based page number.
 * @param pageSize - Maximum items per page (must be >= 1).
 * @returns Clamped page metadata and sliced items.
 */
export function paginateSlice<T>(
  items: ReadonlyArray<T>,
  page: number,
  pageSize: number,
): PaginationResult<T> {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const clampedPage = Math.min(Math.max(1, Math.floor(page)), totalPages);
  const offset = (clampedPage - 1) * safePageSize;
  const sliced = items.slice(offset, offset + safePageSize);

  return {
    items: sliced,
    page: clampedPage,
    totalPages,
    totalItems,
    startIndex: totalItems === 0 ? 0 : offset + 1,
    endIndex: totalItems === 0 ? 0 : offset + sliced.length,
  };
}

/**
 * Builds a lowercased searchable string from user identity, role, status, and academic profile fields.
 *
 * @param user - User profile record to index.
 * @returns Lowercased text suitable for substring search matching.
 */
export function searchableUser(user: SearchableUserRecord): string {
  const fields: unknown[] = [
    user.displayName,
    user.email,
    user.role,
    user.status,
    user.academicProfile?.studentNumber,
    user.academicProfile?.course,
    user.academicProfile?.yearLevel,
    user.academicProfile?.section,
  ];
  return fields
    .filter((value): value is string | number | boolean => value !== undefined && value !== null)
    .map((value) => String(value))
    .join(" ")
    .toLowerCase();
}

/**
 * Extracts a human-readable error message from an unknown thrown value.
 *
 * @param cause - Caught error or rejection value.
 * @param fallback - Message returned when `cause` is not an `Error` instance.
 * @returns Resolved error message string.
 */
export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

/**
 * Formats a Firestore `Timestamp`, epoch millisecond number, ISO string, or `Date` into a locale string.
 *
 * @param value - Timestamp-like value to format.
 * @returns Formatted locale timestamp string, or `"—"` when unavailable or invalid.
 */
export function formatTimestamp(value: TimestampLike): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isFinite(value) ? new Date(value).toLocaleString() : "—";
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "—" : value.toLocaleString();
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? "—" : new Date(parsed).toLocaleString();
  }
  if (typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") {
      return value.toDate().toLocaleString();
    }
    if ("toMillis" in value && typeof value.toMillis === "function") {
      return new Date(value.toMillis()).toLocaleString();
    }
  }
  return "—";
}
