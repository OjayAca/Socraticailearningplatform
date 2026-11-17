"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { HelpCircle, X } from "lucide-react";
import { STANDARD_SOLVER_STAGES } from "@/lib/learning/display-labels";
import { Tooltip } from "./ui/tooltip";
import { cn } from "./ui/utils";

/** Target audience context for {@link HelpDialog}. */
type HelpDialogVariant = "student" | "session" | "admin";

/** Props for {@link HelpDialog}. */
export interface HelpDialogProps {
  /** Selects the task-focused guidance displayed in the dialog. */
  variant: HelpDialogVariant;
  /** Optional class override for the trigger button. */
  triggerClassName?: string;
}

const TRIGGER_LABELS: Record<HelpDialogVariant, string> = {
  student: "Open student help",
  session: "Open session help",
  admin: "Open administrator help",
};

const DIALOG_TITLES: Record<HelpDialogVariant, string> = {
  student: "How MINDGUIDE Works",
  session: "Socratic Session Guide",
  admin: "Administrator Console Guide",
};

const DIALOG_DESCRIPTIONS: Record<HelpDialogVariant, string> = {
  student:
    "Quick guidance on starting sessions, progressing through the four reasoning stages, and reviewing feedback.",
  session:
    "How the four Socratic stages, hints, math notation, and draft saving work during a live session.",
  admin:
    "Content approval lifecycle, audit reason rules, and report privacy defaults.",
};

/**
 * Contextual, keyboard-accessible help dialog triggered by a 44x44px `?` icon button.
 * Reuses existing light/dark theme tokens, traps focus while open, and closes cleanly on Escape.
 *
 * @param props - See {@link HelpDialogProps}.
 * @returns The help button trigger and modal dialog.
 */
export function HelpDialog({ variant, triggerClassName }: HelpDialogProps) {
  const triggerLabel = TRIGGER_LABELS[variant];
  const isSession = variant === "session";
  const ringClass = isSession
    ? "focus-visible:ring-violet-500"
    : "focus-visible:ring-indigo-500";

  return (
    <DialogPrimitive.Root>
      <Tooltip label={triggerLabel}>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
              ringClass,
              triggerClassName,
            )}
          >
            <HelpCircle aria-hidden="true" className="h-4.5 w-4.5" />
          </button>
        </DialogPrimitive.Trigger>
      </Tooltip>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none fixed top-1/2 left-1/2 z-50 max-h-[85dvh] w-[min(34rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto overscroll-contain rounded-3xl border border-slate-200 bg-white p-5 text-slate-950 shadow-xl sm:p-6 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogPrimitive.Title className="text-lg font-bold text-slate-950 dark:text-white">
                {DIALOG_TITLES[variant]}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                {DIALOG_DESCRIPTIONS[variant]}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Close help"
                className={cn(
                  "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white",
                  ringClass,
                )}
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </DialogPrimitive.Close>
          </div>

          <div className="mt-5 space-y-5 text-sm leading-6 text-slate-700 dark:text-slate-300">
            {variant === "admin" ? <AdminHelpBody /> : <StudentHelpBody isSession={isSession} />}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function StudentHelpBody({ isSession }: { isSession: boolean }) {
  return (
    <>
      <section aria-labelledby="help-stages-heading">
        <h3
          id="help-stages-heading"
          className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
        >
          Four Socratic Learning Stages
        </h3>
        <ol className="mt-2.5 space-y-2.5">
          {STANDARD_SOLVER_STAGES.map((stage) => (
            <li
              key={stage.id}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60"
            >
              <p className="font-bold text-slate-950 dark:text-white">
                {stage.number}. {stage.label}
              </p>
              <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                {stage.description}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="help-tips-heading" className="space-y-2">
        <h3
          id="help-tips-heading"
          className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
        >
          {isSession ? "Using This Workspace" : "Tips & Support"}
        </h3>
        <ul className="list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <li>
            <strong>Hints &amp; solution unlock:</strong> Request progressive hints
            (Levels 1–3) when stuck. The full step-by-step solution and Critical
            Thinking Scorecard unlock after completing all four stages.
          </li>
          <li>
            <strong>Math notation:</strong> Use <strong>Add equation</strong> for
            fractions, powers, roots, or logic symbols. In custom problems, place{" "}
            <code>[math]</code> where the expression belongs.
          </li>
          <li>
            <strong>Drafts vs. saved work:</strong> Typed drafts stay only in this
            browser tab until submitted. Submitted turns are saved to your account.
          </li>
          <li>
            <strong>Keyboard:</strong> Press <code>Enter</code> to send your
            reasoning, <code>Shift+Enter</code> for a new line, and{" "}
            <code>Escape</code> to close dialogs.
          </li>
        </ul>
      </section>
    </>
  );
}

function AdminHelpBody() {
  return (
    <>
      <section aria-labelledby="help-admin-workflow">
        <h3
          id="help-admin-workflow"
          className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
        >
          Content Approval Lifecycle
        </h3>
        <p className="mt-1.5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          Problems move from <strong>Draft</strong> →{" "}
          <strong>Pending validation</strong> → <strong>Approved</strong> or{" "}
          <strong>Rejected</strong>. Only dependency-free drafts or rejected
          records can be permanently deleted; approved or referenced items are
          archived to preserve history.
        </p>
      </section>

      <section aria-labelledby="help-admin-audit">
        <h3
          id="help-admin-audit"
          className="text-xs font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-400"
        >
          Audit Reasons &amp; Report Privacy
        </h3>
        <ul className="mt-1.5 list-disc space-y-1.5 pl-5 text-xs leading-5 text-slate-600 dark:text-slate-300">
          <li>
            <strong>Minimum 8 characters:</strong> Academic profile edits,
            announcements, permanent content deletion, and post-score support
            overrides.
          </li>
          <li>
            <strong>Minimum 4 characters:</strong> User account status actions
            and report CSV/print exports.
          </li>
          <li>
            <strong>Reports:</strong> Pseudonymized by default unless{" "}
            <strong>Include identity</strong> is enabled.
          </li>
        </ul>
      </section>
    </>
  );
}
