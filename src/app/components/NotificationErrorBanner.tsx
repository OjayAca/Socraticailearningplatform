"use client";

import { useLocation } from "react-router";
import { RefreshCw } from "lucide-react";
import { useNotificationStore } from "@/stores/notification-store";
import { Banner } from "./ui/banner";

const NOTIFICATION_ROUTES = new Set([
  "/student/notifications",
  "/admin/notifications",
]);

/**
 * App-wide persistent banner surfaced when the authenticated notification
 * listener fails outside the dedicated Notifications pages (which already
 * render an inline {@link Alert} for the same error).
 *
 * @returns The error banner, or `null` when healthy or on a notifications route.
 */
export function NotificationErrorBanner() {
  const { error, retryNotifications, clearError } = useNotificationStore();
  const { pathname } = useLocation();

  if (!error || NOTIFICATION_ROUTES.has(pathname)) {
    return null;
  }

  return (
    <Banner
      tone="error"
      onDismiss={clearError}
      action={
        <button
          type="button"
          onClick={retryNotifications}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current dark:border-red-700 dark:hover:bg-red-900/50"
        >
          <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
          Retry
        </button>
      }
    >
      {error}
    </Banner>
  );
}
