"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  Eye,
  GraduationCap,
  Loader2,
  Mail,
  MoreVertical,
  Pencil,
  ShieldAlert,
  UserCheck,
  UserX,
  X,
} from "lucide-react";
import { collection, getDocs, type DocumentData } from "firebase/firestore";
import { accountActions, type AccountAction } from "@/lib/account-transitions";
import { db } from "@/lib/firebase";
import { adminEditAcademicProfile, adminManageUser } from "@/lib/secure-api";
import { Alert } from "../ui/alert";
import { ConfirmDialog } from "../ui/confirm-dialog";
import { ListRowSkeleton } from "../ui/skeleton";
import { AdminShell } from "./AdminShell";
import {
  AdminFilterPill,
  AdminPagination,
  AdminSearchInput,
  PageTitle,
  errorMessage,
  formatTimestamp,
  paginateSlice,
  searchableUser,
  statusBadgeClass,
  type SearchableAcademicProfile,
  type TimestampLike,
} from "./admin-shared";

const USERS_PAGE_SIZE = 10;

const STATUS_FILTERS = ["all", "active", "suspended", "deactivated"] as const;
const ROLE_FILTERS = ["all", "student", "admin"] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number];
type RoleFilter = (typeof ROLE_FILTERS)[number];

/** Academic profile fields stored on student user documents. */
interface AcademicProfileRecord extends SearchableAcademicProfile {
  studentNumber?: string;
  course?: string;
  yearLevel?: string;
  section?: string;
}

/** Strict Firestore user account record rendered by {@link SecureAdminUsers}. */
export interface AdminUserRecord {
  id: string;
  uid?: string;
  displayName?: string;
  email?: string;
  emailVerified?: boolean;
  role?: string;
  status?: string;
  createdAt?: TimestampLike;
  updatedAt?: TimestampLike;
  consentVersion?: string;
  consentAcceptedAt?: TimestampLike;
  academicProfile?: AcademicProfileRecord | null;
}

interface PendingAccountAction {
  userId: string;
  displayName: string;
  action: "suspend" | "deactivate";
}

interface AcademicFormValues {
  course: string;
  yearLevel: string;
  section: string;
}

interface MenuPosition {
  top: number;
  right: number;
}

function toAdminUserRecord(id: string, data: DocumentData): AdminUserRecord {
  const rawAcademic =
    data.academicProfile && typeof data.academicProfile === "object"
      ? (data.academicProfile as Record<string, unknown>)
      : null;

  return {
    id,
    uid: typeof data.uid === "string" ? data.uid : id,
    displayName: typeof data.displayName === "string" ? data.displayName : undefined,
    email: typeof data.email === "string" ? data.email : undefined,
    emailVerified: typeof data.emailVerified === "boolean" ? data.emailVerified : undefined,
    role: typeof data.role === "string" ? data.role : undefined,
    status: typeof data.status === "string" ? data.status : undefined,
    createdAt: data.createdAt as TimestampLike,
    updatedAt: data.updatedAt as TimestampLike,
    consentVersion: typeof data.consentVersion === "string" ? data.consentVersion : undefined,
    consentAcceptedAt: data.consentAcceptedAt as TimestampLike,
    academicProfile: rawAcademic
      ? {
          studentNumber:
            typeof rawAcademic.studentNumber === "string"
              ? rawAcademic.studentNumber
              : undefined,
          course: typeof rawAcademic.course === "string" ? rawAcademic.course : undefined,
          yearLevel:
            typeof rawAcademic.yearLevel === "string" ? rawAcademic.yearLevel : undefined,
          section: typeof rawAcademic.section === "string" ? rawAcademic.section : undefined,
        }
      : null,
  };
}

function getUserDisplayLabel(user: AdminUserRecord): string {
  return user.displayName ?? user.email ?? user.id;
}

function canEditAcademicInfo(user: AdminUserRecord): boolean {
  return (
    user.role === "student" &&
    user.status !== "anonymized" &&
    Boolean(user.academicProfile)
  );
}

function getActionMenuLabel(action: AccountAction): string {
  switch (action) {
    case "suspend":
      return "Suspend Account";
    case "deactivate":
      return "Deactivate Account";
    case "activate":
      return "Reactivate Account";
  }
}

interface UserRowActionMenuProps {
  user: AdminUserRecord;
  disabled: boolean;
  onViewProfile: (user: AdminUserRecord) => void;
  onEditAcademic: (user: AdminUserRecord) => void;
  onAccountAction: (user: AdminUserRecord, action: AccountAction) => void;
}

function UserRowActionMenu({
  user,
  disabled,
  onViewProfile,
  onEditAcademic,
  onAccountAction,
}: UserRowActionMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition>({ top: 0, right: 16 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  const displayLabel = getUserDisplayLabel(user);
  const availableAccountActions = accountActions(user.status, user.role);
  const showAcademicEdit = canEditAcademicInfo(user);

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, []);

  const updatePosition = useCallback(() => {
    const button = triggerRef.current;
    if (!button || typeof window === "undefined") return;
    const rect = button.getBoundingClientRect();
    const estimatedHeight = 200;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setPosition({
      top: openUpward ? Math.max(8, rect.top - estimatedHeight) : rect.bottom + 6,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent | PointerEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu(true);
      }
    }

    function handleViewportChange() {
      updatePosition();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [open, closeMenu, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]');
    firstItem?.focus();
  }, [open]);

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (items.length === 0) return;

    const currentIndex = items.findIndex((item) => item === document.activeElement);

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const prevIndex =
        currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      items[prevIndex]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  function handleToggle() {
    if (open) {
      closeMenu(false);
      return;
    }
    updatePosition();
    setOpen(true);
  }

  const menuContent = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`Actions for ${displayLabel}`}
      onKeyDown={handleMenuKeyDown}
      style={{ top: `${position.top}px`, right: `${position.right}px` }}
      className="fixed z-50 w-56 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"
    >
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          setOpen(false);
          onViewProfile(user);
        }}
        className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
      >
        <Eye aria-hidden="true" className="h-4 w-4 text-slate-400" />
        <span>View Profile</span>
      </button>

      {showAcademicEdit && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            setOpen(false);
            onEditAcademic(user);
          }}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800"
        >
          <Pencil aria-hidden="true" className="h-4 w-4 text-indigo-500" />
          <span>Edit Academic Information</span>
        </button>
      )}

      {availableAccountActions.length > 0 && (
        <div
          role="separator"
          className="my-1 border-t border-slate-200 dark:border-slate-800"
        />
      )}

      {availableAccountActions.map((action) => {
        const isDestructive = action === "suspend" || action === "deactivate";
        const Icon =
          action === "activate"
            ? UserCheck
            : action === "deactivate"
              ? UserX
              : ShieldAlert;

        return (
          <button
            key={action}
            type="button"
            role="menuitem"
            disabled={disabled}
            onClick={() => {
              setOpen(false);
              onAccountAction(user, action);
            }}
            className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-xs font-semibold transition focus-visible:outline-none disabled:opacity-50 ${
              isDestructive
                ? "text-rose-700 hover:bg-rose-50 focus-visible:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:focus-visible:bg-rose-950/40"
                : "text-emerald-700 hover:bg-emerald-50 focus-visible:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40 dark:focus-visible:bg-emerald-950/40"
            }`}
          >
            <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
            <span>{getActionMenuLabel(action)}</span>
          </button>
        );
      })}
    </div>
  ) : null;

  return (
    <div className="inline-flex justify-end">
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={`Actions for ${displayLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={handleToggle}
        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
      >
        <MoreVertical aria-hidden="true" className="h-4 w-4" />
      </button>
      {menuContent && typeof document !== "undefined"
        ? createPortal(menuContent, document.body)
        : menuContent}
    </div>
  );
}

interface ProfileDetailDialogProps {
  user: AdminUserRecord | null;
  onOpenChange: (open: boolean) => void;
  onEditAcademic: (user: AdminUserRecord) => void;
}

function ProfileDetailDialog({
  user,
  onOpenChange,
  onEditAcademic,
}: ProfileDetailDialogProps) {
  const displayLabel = user ? getUserDisplayLabel(user) : "";
  const verificationLabel =
    user?.emailVerified === true
      ? "Verified"
      : user?.emailVerified === false
        ? "Not verified"
        : "Not recorded";

  return (
    <DialogPrimitive.Root open={Boolean(user)} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-slate-950 dark:text-white">
                {displayLabel}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                User profile, verification status, and academic enrollment metadata.
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label="Close profile details"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {user && (
            <div className="mt-5 space-y-5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  {user.role ?? "unknown"}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(user.status ?? "active")}`}
                >
                  {user.status ?? "active"}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                    user.emailVerified
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  }`}
                >
                  <CheckCircle2 aria-hidden="true" className="h-3.5 w-3.5" />
                  Email: {verificationLabel}
                </span>
              </div>

              <dl className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-2 dark:border-slate-800 dark:bg-slate-800/40">
                <div>
                  <dt className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <Mail aria-hidden="true" className="h-3.5 w-3.5" />
                    Email
                  </dt>
                  <dd className="mt-1 break-all font-medium text-slate-900 dark:text-slate-100">
                    {user.email ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Account ID
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs text-slate-700 dark:text-slate-300">
                    {user.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Created
                  </dt>
                  <dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    {formatTimestamp(user.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Consent
                  </dt>
                  <dd className="mt-1 text-xs text-slate-700 dark:text-slate-300">
                    {user.consentVersion
                      ? `${user.consentVersion} (${formatTimestamp(user.consentAcceptedAt)})`
                      : "—"}
                  </dd>
                </div>
              </dl>

              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    <GraduationCap aria-hidden="true" className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    Academic Information
                  </h3>
                  {canEditAcademicInfo(user) && (
                    <button
                      type="button"
                      onClick={() => {
                        onOpenChange(false);
                        onEditAcademic(user);
                      }}
                      className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                    >
                      Edit Academic Information
                    </button>
                  )}
                </div>
                {user.academicProfile ? (
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">
                        Student Number
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {user.academicProfile.studentNumber ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Course</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {user.academicProfile.course ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Year level</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {user.academicProfile.yearLevel ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Section</dt>
                      <dd className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                        {user.academicProfile.section ?? "—"}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    No academic enrollment profile attached to this account.
                  </p>
                )}
              </div>

              <div className="flex justify-end">
                <DialogPrimitive.Close asChild>
                  <button
                    type="button"
                    className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    Close
                  </button>
                </DialogPrimitive.Close>
              </div>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface AcademicProfileDialogProps {
  user: AdminUserRecord | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function AcademicProfileDialog({
  user,
  onClose,
  onSaved,
}: AcademicProfileDialogProps) {
  const [values, setValues] = useState<AcademicFormValues>({
    course: user?.academicProfile?.course ?? "",
    yearLevel: user?.academicProfile?.yearLevel ?? "",
    section: user?.academicProfile?.section ?? "",
  });
  const [editReason, setEditReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  function handleOpenChange(nextOpen: boolean) {
    if (busy && !nextOpen) return;
    if (!nextOpen) onClose();
  }

  return (
    <DialogPrimitive.Root open={Boolean(user)} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-slate-950 dark:text-white">
                Edit Academic Information
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {user
                  ? `Update course, year level, and section for ${getUserDisplayLabel(user)}. Authentication credentials are managed separately in Firebase Console.`
                  : ""}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              disabled={busy}
              aria-label="Close academic profile dialog"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {user && (
            <form
              aria-label={`Edit academic profile for ${getUserDisplayLabel(user)}`}
              className="mt-5 space-y-3.5"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setFormError("");
                try {
                  await adminEditAcademicProfile({
                    userId: user.id,
                    course: values.course,
                    yearLevel: values.yearLevel,
                    section: values.section,
                    reason: editReason,
                  });
                  await onSaved();
                  onClose();
                } catch (cause) {
                  setFormError(errorMessage(cause, "Profile update failed."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {(
                [
                  ["course", "Course"],
                  ["yearLevel", "Year level"],
                  ["section", "Section"],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  {label}
                  <input
                    aria-label={label}
                    className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                    required
                    maxLength={100}
                    disabled={busy}
                    value={values[key]}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [key]: event.target.value }))
                    }
                  />
                </label>
              ))}

              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Profile edit reason
                <input
                  aria-label="Profile edit reason"
                  className="mt-1.5 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-normal text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  required
                  minLength={8}
                  maxLength={1000}
                  disabled={busy}
                  value={editReason}
                  onChange={(event) => setEditReason(event.target.value)}
                />
                <span className="mt-1 block font-normal text-slate-500 dark:text-slate-400">
                  Minimum 8 characters required ({editReason.trim().length}/8).
                </span>
              </label>

              {formError && (
                <Alert tone="error" className="text-xs">
                  {formError}
                </Alert>
              )}

              <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onClose}
                  className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
                >
                  {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                  <span>{busy ? "Saving..." : "Save academic profile"}</span>
                </button>
              </div>
            </form>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Redesigned administrator user directory featuring a 5-column table, search and role/status
 * filtering, client-side pagination, accessible per-row three-dot action menus, profile inspection,
 * separated academic profile editing, and audited status confirmation dialogs.
 *
 * @returns The rendered user management view inside {@link AdminShell}.
 */
export function SecureAdminUsers() {
  const [usersList, setUsersList] = useState<AdminUserRecord[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [page, setPage] = useState(1);
  const [reason, setReason] = useState("Authorized capstone account administration");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyUserKey, setBusyUserKey] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAccountAction | null>(null);
  const [profileUser, setProfileUser] = useState<AdminUserRecord | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserRecord | null>(null);

  const load = useCallback(async () => {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(collection(db, "users"));
      setUsersList(
        snapshot.docs.map((item) => toAdminUserRecord(item.id, item.data())),
      );
    } catch (cause) {
      setError(errorMessage(cause, "User accounts could not be loaded."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedQuery = search.toLowerCase();
    return usersList.filter((user) => {
      const userStatus = user.status ?? "active";
      if (statusFilter !== "all" && userStatus !== statusFilter) return false;
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      return searchableUser(user).includes(normalizedQuery);
    });
  }, [search, statusFilter, roleFilter, usersList]);

  const paginated = useMemo(
    () => paginateSlice(filtered, page, USERS_PAGE_SIZE),
    [filtered, page],
  );

  const hasFilters = Boolean(search.trim()) || statusFilter !== "all" || roleFilter !== "all";

  async function act(userId: string, action: AccountAction) {
    if (busyUserKey) return;
    setBusyUserKey(`${userId}:${action}`);
    setStatusMessage(null);
    setActionError(null);
    try {
      await adminManageUser({ userId, action, reason });
      setStatusMessage(`Account action '${action}' completed.`);
      await load();
    } catch (cause) {
      setActionError(errorMessage(cause, "User action failed."));
    } finally {
      setBusyUserKey(null);
      setPendingAction(null);
    }
  }

  function handleMenuAccountAction(user: AdminUserRecord, action: AccountAction) {
    if (action === "activate") {
      void act(user.id, action);
      return;
    }
    setPendingAction({
      userId: user.id,
      displayName: getUserDisplayLabel(user),
      action,
    });
  }

  return (
    <AdminShell active="users">
      <PageTitle
        title="User Account Management"
        description="Search learner profiles, inspect academic records, and manage application access. Use Firebase Console for privileged Authentication operations."
      />

      {error && (
        <Alert
          tone="error"
          className="mb-4"
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="min-h-11 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
            >
              Retry
            </button>
          }
        >
          {error}
        </Alert>
      )}

      {actionError && (
        <Alert tone="error" className="mb-4" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {statusMessage && (
        <Alert tone="success" className="mb-4" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <AdminSearchInput
          value={search}
          onChange={(nextValue) => {
            setSearch(nextValue);
            setPage(1);
          }}
          placeholder="Search name, email, student number, course, year, or section"
          ariaLabel="Search users"
          clearAriaLabel="Clear user search"
        />
        <div>
          <input
            value={reason}
            aria-label="Account action audit reason"
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required audit reason"
            className="min-h-11 w-full rounded-xl border border-slate-200 bg-white p-3 text-base text-slate-950 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:text-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Minimum 4 characters required for account actions ({reason.trim().length}/4).
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((status) => (
          <AdminFilterPill
            key={status}
            active={statusFilter === status}
            onClick={() => {
              setStatusFilter(status);
              setPage(1);
            }}
          >
            {status === "all" ? "All statuses" : status}
          </AdminFilterPill>
        ))}

        {ROLE_FILTERS.map((role) => (
          <AdminFilterPill
            key={role}
            variant="muted"
            active={roleFilter === role}
            onClick={() => {
              setRoleFilter(role);
              setPage(1);
            }}
          >
            {role === "all" ? "All roles" : role}
          </AdminFilterPill>
        ))}

        {hasFilters && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setRoleFilter("all");
              setPage(1);
            }}
            className="min-h-11 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        Delete Auth accounts or reset access in{" "}
        <a
          className="font-medium underline"
          href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/authentication/users`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Firebase Console
        </a>
        . Role changes require an authorized operator to update both custom claims and the Firestore
        profile; they cannot be performed by this browser.
      </p>

      {loading ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <ListRowSkeleton rows={5} label="Loading administrator data" />
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
            {paginated.items.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-600 dark:text-slate-300">
                No user accounts match your current search or filters.
              </div>
            ) : (
              <div
                role="region"
                aria-label="User accounts table (scroll horizontally)"
                tabIndex={0}
                className="table-scroll max-w-full overflow-x-auto focus-visible:outline-2 focus-visible:outline-indigo-500"
              >
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                    <tr>
                      <th scope="col" className="p-4">Name</th>
                      <th scope="col" className="p-4">Email</th>
                      <th scope="col" className="p-4">Role</th>
                      <th scope="col" className="p-4">Account Status</th>
                      <th scope="col" className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {paginated.items.map((user) => (
                      <tr
                        key={user.id}
                        className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      >
                        <td className="p-4">
                          <p className="font-bold text-slate-900 dark:text-slate-100">
                            {user.displayName ?? "Unnamed user"}
                          </p>
                          {user.academicProfile?.course && (
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {[
                                user.academicProfile.studentNumber,
                                user.academicProfile.course,
                                user.academicProfile.yearLevel
                                  ? `Year ${user.academicProfile.yearLevel}`
                                  : undefined,
                                user.academicProfile.section
                                  ? `Sec ${user.academicProfile.section}`
                                  : undefined,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </p>
                          )}
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">
                          {user.email ?? "—"}
                        </td>
                        <td className="p-4">
                          <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {user.role ?? "—"}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(user.status ?? "active")}`}
                          >
                            {user.status ?? "active"}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <UserRowActionMenu
                            user={user}
                            disabled={busyUserKey !== null}
                            onViewProfile={setProfileUser}
                            onEditAcademic={setEditingUser}
                            onAccountAction={handleMenuAccountAction}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <AdminPagination
            page={paginated.page}
            pageSize={USERS_PAGE_SIZE}
            totalItems={filtered.length}
            onPageChange={setPage}
            itemLabel="user accounts"
          />
        </>
      )}

      <ProfileDetailDialog
        user={profileUser}
        onOpenChange={(open) => {
          if (!open) setProfileUser(null);
        }}
        onEditAcademic={(selected) => setEditingUser(selected)}
      />

      <AcademicProfileDialog
        key={editingUser?.id ?? "none"}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={async () => {
          setStatusMessage("Academic profile updated.");
          await load();
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
        variant="destructive"
        title={
          pendingAction?.action === "deactivate"
            ? "Deactivate user account?"
            : "Suspend user account?"
        }
        description={
          pendingAction
            ? `This will ${pendingAction.action} ${pendingAction.displayName}'s platform access using audit reason: "${reason.trim() || "(none)"}".`
            : ""
        }
        confirmLabel={
          pendingAction?.action === "deactivate" ? "Deactivate account" : "Suspend account"
        }
        cancelLabel="Cancel"
        isLoading={busyUserKey !== null}
        onConfirm={() => {
          if (pendingAction) {
            void act(pendingAction.userId, pendingAction.action);
          }
        }}
      />
    </AdminShell>
  );
}
