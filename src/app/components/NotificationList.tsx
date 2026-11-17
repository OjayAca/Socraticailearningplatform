"use client";

import { Bell, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import {
  getNotificationActionUrl,
  getNotificationText,
  useNotificationStore,
} from "@/stores/notification-store";
import { cn } from "./ui/utils";

/** Props for {@link NotificationList}. */
export interface NotificationListProps {
  /** Uses tighter spacing suited for the quick-view slide-over drawer. */
  compact?: boolean;
  /** Optional limit on the number of items displayed. */
  maxItems?: number;
  /** Invoked after a notification is activated (for example, to close a drawer). */
  onItemSelect?: () => void;
}

/**
 * Shared notification feed rendering loading, empty, and interactive unread/read
 * items backed by {@link useNotificationStore}.
 *
 * @param props - See {@link NotificationListProps}.
 * @returns The rendered notification list or empty/loading state.
 */
export function NotificationList({
  compact = false,
  maxItems,
  onItemSelect,
}: NotificationListProps) {
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useAuthStore((state) => state.userProfile);
  const {
    notifications = [],
    isLoading = false,
    markAsRead,
  } = useNotificationStore();
  const navigate = useNavigate();

  const currentUserId = firebaseUser?.uid ?? userProfile?.uid;
  const scopedNotifications = currentUserId
    ? notifications.filter((item) => {
        const recipient = item.recipientId ?? item.userId;
        return !recipient || recipient === currentUserId;
      })
    : notifications;

  const visibleNotifications =
    typeof maxItems === "number"
      ? scopedNotifications.slice(0, maxItems)
      : scopedNotifications;

  function handleNotificationClick(
    notificationId: string,
    isRead: boolean,
    actionUrl?: string,
  ) {
    if (!isRead) {
      void markAsRead(notificationId).catch((cause) => {
        if (actionUrl) {
          toast.error(
            cause instanceof Error
              ? cause.message
              : "Could not mark the notification as read.",
          );
        }
      });
    }
    onItemSelect?.();
    if (actionUrl) {
      navigate(actionUrl);
    }
  }

  function handleMarkAsReadOnly(notificationId: string) {
    void markAsRead(notificationId).catch((cause) => {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "Could not mark the notification as read.",
      );
    });
  }

  if (isLoading) {
    return (
      <div className={cn("text-center", compact ? "p-8" : "p-16")}>
        <Loader2
          aria-hidden="true"
          className={cn(
            "mx-auto animate-spin text-indigo-600",
            compact ? "mb-3 h-7 w-7" : "mb-4 h-10 w-10",
          )}
        />
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Loading notifications…
        </p>
      </div>
    );
  }

  if (visibleNotifications.length === 0) {
    return (
      <div className={cn("text-center", compact ? "p-8" : "p-16")}>
        <Bell
          aria-hidden="true"
          className={cn(
            "mx-auto text-slate-300 dark:text-slate-600",
            compact ? "mb-3 h-9 w-9" : "mb-4 h-12 w-12",
          )}
        />
        <h3 className="text-base font-medium text-slate-900 dark:text-white sm:text-lg">
          All caught up!
        </h3>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          You don't have any notifications yet.
        </p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {visibleNotifications.map((notification) => {
        const { title, message } = getNotificationText(notification);
        const actionUrl = getNotificationActionUrl(
          notification,
          userProfile?.role,
        );
        const timestamp = formatNotificationTimestamp(notification.createdAt);

        return (
          <div
            key={notification.id}
            className={cn(
              "flex items-start gap-2 transition-colors",
              compact ? "p-3.5" : "p-4 sm:items-center sm:gap-4 sm:p-6",
              notification.read
                ? "bg-transparent text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40"
                : "bg-indigo-50/50 text-slate-900 hover:bg-indigo-50 dark:bg-indigo-900/10 dark:text-white dark:hover:bg-indigo-900/20",
            )}
          >
            <button
              type="button"
              onClick={() =>
                handleNotificationClick(
                  notification.id,
                  notification.read,
                  actionUrl,
                )
              }
              className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
              aria-label={`${notification.read ? "Read" : "Unread"}: ${title}`}
            >
              <span
                className={cn(
                  "flex shrink-0 items-center justify-center",
                  compact ? "h-9 w-9 rounded-xl" : "h-12 w-12 rounded-2xl",
                  notification.read
                    ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                    : "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-400",
                )}
              >
                <Bell aria-hidden="true" className={compact ? "h-4 w-4" : "h-6 w-6"} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      notification.read
                        ? "text-slate-700 dark:text-slate-300"
                        : "text-indigo-950 dark:text-indigo-50",
                    )}
                  >
                    {title}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                      notification.read
                        ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                        : "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
                    )}
                  >
                    {!notification.read && (
                      <span
                        className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400"
                        aria-hidden="true"
                      />
                    )}
                    {notification.read ? "Read" : "Unread"}
                  </span>
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed opacity-90 sm:text-sm">
                  {message}
                </span>
                {timestamp && (
                  <time
                    dateTime={timestamp.iso}
                    className="mt-1 block text-[11px] font-medium text-slate-400 dark:text-slate-500"
                  >
                    {timestamp.label}
                  </time>
                )}
              </span>
            </button>
            {!notification.read && (
              <button
                type="button"
                onClick={() => handleMarkAsReadOnly(notification.id)}
                aria-label={`Mark "${title}" as read`}
                className="mt-0.5 shrink-0 rounded-lg border border-indigo-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-indigo-700 transition hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-indigo-800 dark:bg-slate-900 dark:text-indigo-300 dark:hover:bg-indigo-950/60"
              >
                Mark as read
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatNotificationTimestamp(
  createdAt: unknown,
): { label: string; iso?: string } | null {
  if (!createdAt) return null;

  let date: Date | null = null;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) {
    date = new Date(createdAt);
  } else if (createdAt instanceof Date) {
    date = createdAt;
  } else if (typeof createdAt === "string") {
    const parsed = Date.parse(createdAt);
    if (!Number.isNaN(parsed)) {
      date = new Date(parsed);
    }
  } else if (typeof createdAt === "object") {
    if ("toDate" in createdAt && typeof (createdAt as { toDate: unknown }).toDate === "function") {
      date = (createdAt as { toDate: () => Date }).toDate();
    } else if (
      "toMillis" in createdAt &&
      typeof (createdAt as { toMillis: unknown }).toMillis === "function"
    ) {
      date = new Date((createdAt as { toMillis: () => number }).toMillis());
    }
  }

  if (!date || Number.isNaN(date.getTime())) return null;

  return {
    label: date.toLocaleString(),
    iso: date.toISOString(),
  };
}
