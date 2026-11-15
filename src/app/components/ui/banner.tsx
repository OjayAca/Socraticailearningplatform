"use client";

import type { ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";
import { cn } from "./utils";
import { getNotificationToneStyle, type NotificationTone } from "./notification-tone";

/** Banners describe app-wide state, so routine success messages are excluded. */
type BannerTone = Exclude<NotificationTone, "success">;

/** Props for the full-width, persistent {@link Banner}. */
export interface BannerProps {
  tone: BannerTone;
  /** The message body. */
  children: ReactNode;
  /** Overrides the tone's default icon (e.g. a Wi-Fi icon for connectivity). */
  icon?: LucideIcon;
  /** Optional action such as "Retry" or "Verify email". */
  action?: ReactNode;
  /** When provided, the banner can be dismissed. Omit for banners that must stay until resolved. */
  onDismiss?: () => void;
  className?: string;
}

/**
 * Full-width banner for persistent, app- or session-wide conditions such as
 * lost connectivity or degraded services. It stays visible without blocking
 * interaction until the condition clears or the user dismisses it.
 *
 * @param props - See {@link BannerProps}.
 * @returns The rendered banner element.
 */
export function Banner({ tone, children, icon, action, onDismiss, className }: BannerProps) {
  const { containerClassName, Icon: ToneIcon, role } = getNotificationToneStyle(tone);
  const Icon = icon ?? ToneIcon;

  return (
    <div
      role={role}
      data-slot="banner"
      data-tone={tone}
      className={cn(
        "flex w-full shrink-0 items-center gap-3 border-b px-4 py-2 text-sm sm:px-6",
        containerClassName,
        className,
      )}
    >
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss banner"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
