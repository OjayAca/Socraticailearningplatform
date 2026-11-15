"use client";

import { useState } from "react";
import { Link } from "react-router";
import { ArrowRight, Bell, RefreshCw } from "lucide-react";
import { useNotificationStore } from "@/stores/notification-store";
import { NotificationList } from "./NotificationList";
import { Alert } from "./ui/alert";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { Tooltip } from "./ui/tooltip";

/** Props for {@link NotificationDrawer}. */
export interface NotificationDrawerProps {
  /** Destination route for the full notifications inbox page. */
  notificationsHref: string;
}

const MAX_DRAWER_ITEMS = 15;

/**
 * Header trigger button with an unread badge and slide-over notification inbox
 * backed by {@link useNotificationStore}. Lets users inspect and act on updates
 * without leaving their current screen.
 *
 * @param props - See {@link NotificationDrawerProps}.
 * @returns The notification trigger button and drawer sheet.
 */
export function NotificationDrawer({ notificationsHref }: NotificationDrawerProps) {
  const [open, setOpen] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const {
    unreadCount = 0,
    error = null,
    markAllAsRead,
    retryNotifications,
  } = useNotificationStore();

  const triggerLabel =
    unreadCount > 0
      ? `Open notifications (${unreadCount} unread)`
      : "Open notifications";
  const badgeText = unreadCount > 99 ? "99+" : String(unreadCount);

  async function handleMarkAllAsRead() {
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } catch {
      // Errors are surfaced via the notification store alert inside the drawer.
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Tooltip label={triggerLabel}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={triggerLabel}
            className="relative mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <Bell aria-hidden="true" className="h-4.5 w-4.5" />
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-[#0b1120]"
              >
                {badgeText}
              </span>
            )}
          </button>
        </SheetTrigger>
      </Tooltip>

      <SheetContent
        side="right"
        className="flex w-[min(24rem,92vw)] flex-col gap-0 border-slate-200 bg-white p-0 text-slate-950 dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-100"
      >
        <SheetHeader className="border-b border-slate-200 px-5 py-4 pr-14 dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <SheetTitle className="text-base font-bold text-slate-950 dark:text-white">
              Notifications
            </SheetTitle>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllAsRead()}
                disabled={isMarkingAll}
                className="rounded-lg px-2.5 py-1 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
              >
                {isMarkingAll ? "Marking…" : "Mark all as read"}
              </button>
            )}
          </div>
          <SheetDescription className="text-xs text-slate-500 dark:text-slate-400">
            {unreadCount > 0
              ? `${unreadCount} unread ${unreadCount === 1 ? "update" : "updates"}`
              : "All caught up"}
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {error && (
            <div className="p-3">
              <Alert
                tone="error"
                action={
                  <button
                    type="button"
                    onClick={retryNotifications}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-950/50"
                  >
                    <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
                    Retry
                  </button>
                }
              >
                {error}
              </Alert>
            </div>
          )}

          <NotificationList
            compact
            maxItems={MAX_DRAWER_ITEMS}
            onItemSelect={() => setOpen(false)}
          />
        </div>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <Link
            to={notificationsHref}
            onClick={() => setOpen(false)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            View all notifications
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
