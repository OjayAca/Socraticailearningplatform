/** Learner notification center. */

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Alert } from "../ui/alert";
import { NotificationList } from "../NotificationList";
import { useNotificationStore } from "@/stores/notification-store";

export function NotificationContent() {
  const {
    unreadCount,
    error,
    markAllAsRead,
    retryNotifications,
  } = useNotificationStore();
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  async function handleMarkAllAsRead() {
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } catch {
      // The notification store exposes the error directly below the heading.
    } finally {
      setIsMarkingAll(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 motion-reduce:animate-none">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">Notifications</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2">
            You have <strong className="text-indigo-600 dark:text-indigo-400">{unreadCount}</strong> unread updates.
          </p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllAsRead()}
              disabled={isMarkingAll}
              className="min-h-11 rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              {isMarkingAll ? "Marking…" : "Mark all as read"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert
          tone="error"
          className="rounded-2xl p-4"
          action={
            <button
              type="button"
              onClick={retryNotifications}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2 font-semibold hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 dark:border-red-800 dark:hover:bg-red-950/50"
            >
              <RefreshCw aria-hidden="true" className="w-4 h-4" /> Retry
            </button>
          }
        >
          {error}
        </Alert>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <NotificationList />
      </div>
    </div>
  );
}
