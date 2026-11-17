"use client";

import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Loader2 } from "lucide-react";
import { cn } from "./utils";

/** Props for the blocking {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Label of the confirming button. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Label of the cancelling button. Defaults to "Cancel". */
  cancelLabel?: string;
  /** `destructive` styles the confirm button for irreversible actions. */
  variant?: "default" | "destructive";
  /** Disables both buttons and shows a spinner while the action runs. */
  isLoading?: boolean;
  /** Invoked when the user confirms. The caller decides when to close. */
  onConfirm: () => void;
}

/**
 * Accessible confirmation modal for irreversible actions or mandatory
 * decisions. Replaces `window.confirm` with a themed, focus-trapped dialog
 * that closes on Cancel or Escape.
 *
 * @param props - See {@link ConfirmDialogProps}.
 * @returns The rendered dialog (portalled to `document.body` when open).
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const isDestructive = variant === "destructive";

  function handleOpenChange(nextOpen: boolean) {
    // Keep the dialog open while the confirmed action is still in flight.
    if (isLoading && !nextOpen) return;
    onOpenChange(nextOpen);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 motion-reduce:animate-none fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          role="alertdialog"
          className="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none fixed top-1/2 left-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-6 text-slate-950 shadow-xl dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        >
          <DialogPrimitive.Title className="text-lg font-bold">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {description}
          </DialogPrimitive.Description>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                disabled={isLoading}
                className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                {cancelLabel}
              </button>
            </DialogPrimitive.Close>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50",
                isDestructive
                  ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-500"
                  : "bg-indigo-600 hover:bg-indigo-700 focus-visible:ring-indigo-500",
              )}
            >
              {isLoading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              {confirmLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
