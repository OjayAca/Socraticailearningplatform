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
  const userProfile = useAuthStore((state) => state.userProfile);
  const {
    notifications = [],
    isLoading = false,
    markAsRead,
  } = useNotificationStore();
  const navigate = useNavigate();

  const visibleNotifications =
    typeof maxItems === "number" ? notifications.slice(0, maxItems) : notifications;

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
        return (
          <button
            type="button"
            key={notification.id}
            onClick={() =>
              handleNotificationClick(
                notification.id,
                notification.read,
                actionUrl,
              )
            }
            className={cn(
              "flex w-full cursor-pointer items-start gap-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500",
              compact ? "p-3.5" : "flex-col p-4 sm:flex-row sm:items-center sm:gap-4 sm:p-6",
              notification.read
                ? "bg-transparent text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800/40"
                : "bg-indigo-50/50 text-slate-900 hover:bg-indigo-50 dark:bg-indigo-900/10 dark:text-white dark:hover:bg-indigo-900/20",
            )}
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
              <span
                className={cn(
                  "block text-sm font-semibold",
                  notification.read
                    ? "text-slate-700 dark:text-slate-300"
                    : "text-indigo-950 dark:text-indigo-50",
                )}
              >
                {title}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed opacity-90 sm:text-sm">
                {message}
              </span>
            </span>
            {!notification.read && (
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-600 sm:mt-0 sm:self-center"
                aria-hidden="true"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
