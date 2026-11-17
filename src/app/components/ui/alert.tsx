"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "./utils";
import { getNotificationToneStyle, type NotificationTone } from "./notification-tone";

/** Props for the contextual, in-flow {@link Alert}. */
export interface AlertProps {
  /** Severity; also decides whether the alert is announced assertively. */
  tone: NotificationTone;
  /** Optional bold heading shown above the message. */
  title?: ReactNode;
  /** The message body. */
  children: ReactNode;
  /** Optional action rendered at the end of the alert (e.g. a Retry button). */
  action?: ReactNode;
  /** When provided, renders a dismiss button that calls this handler. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Inline alert for feedback tied to a specific panel, form or workflow step.
 *
 * Use this when the user must keep the message in view while fixing the issue
 * next to it. For transient confirmations use a toast; for app-wide state use
 * a {@link Banner}; for decisions use a {@link ConfirmDialog}.
 *
 * @param props - See {@link AlertProps}.
 * @returns The rendered alert element.
 */
export function Alert({ tone, title, children, action, onDismiss, className }: AlertProps) {
  const { containerClassName, Icon, role } = getNotificationToneStyle(tone);

  return (
    <div
      role={role}
      data-slot="alert"
      data-tone={tone}
      className={cn(
        "flex flex-wrap items-start gap-3 rounded-xl border p-3 text-sm",
        containerClassName,
        className,
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
