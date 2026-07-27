/** Learner notification center. */

import { useState } from "react";
import { AlertCircle, Bell, Loader2, RefreshCw } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import {
  getNotificationActionUrl,
  getNotificationText,
  useNotificationStore,
} from "@/stores/notification-store";
import { useNavigate } from "react-router";

export function NotificationContent() {
  const { userProfile } = useAuthStore();
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    markAsRead,
    markAllAsRead,
    retryNotifications,
  } = useNotificationStore();
  const navigate = useNavigate();
  const [isMarkingAll, setIsMarkingAll] = useState(false);

  async function handleNotificationClick(
    notificationId: string,
    isRead: boolean,
    actionUrl?: string
  ) {
    try {
      if (!isRead) {
        await markAsRead(notificationId);
      }
    } catch {
      return;
    }
    if (actionUrl) {
      navigate(actionUrl);
    }
  }

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
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 dark:text-white">Notifications</h2>
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
              className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {isMarkingAll ? "Marking…" : "Mark all as read"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 text-sm text-red-700 dark:text-red-300">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={retryNotifications}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 dark:border-red-800 px-4 py-2 font-semibold hover:bg-red-100 dark:hover:bg-red-950/50"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center">
            <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              Loading notifications…
            </p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-16 text-center">
            <Bell className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">All caught up!</h3>
            <p className="text-slate-500 dark:text-slate-400">You don't have any notifications yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {notifications.map((notification) => {
              const { title, message } = getNotificationText(notification);
              const actionUrl = getNotificationActionUrl(
                notification,
                userProfile?.role
              );
              return (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() =>
                    void handleNotificationClick(
                      notification.id,
                      notification.read,
                      actionUrl
                    )
                  }
                  className={`w-full p-6 flex flex-col sm:flex-row sm:items-center gap-4 transition-colors cursor-pointer text-left ${
                    notification.read
                      ? "bg-transparent text-slate-500 dark:text-slate-400"
                      : "bg-indigo-50/50 dark:bg-indigo-900/10 text-slate-900 dark:text-white"
                  }`}
                  aria-label={`${notification.read ? "Read" : "Unread"}: ${title}`}
                >
                  <span
                    className={`w-12 h-12 flex-shrink-0 rounded-2xl flex items-center justify-center ${
                      notification.read ? "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500" : "bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400"
                    }`}
                  >
                    <Bell className="w-6 h-6" />
                  </span>
                  <span className="flex-1">
                    <span className={`block font-semibold ${notification.read ? "text-slate-700 dark:text-slate-300" : "text-indigo-950 dark:text-indigo-50"}`}>
                      {title}
                    </span>
                    <span className="block text-sm mt-1 opacity-90">{message}</span>
                  </span>
                  {!notification.read && (
                    <span className="w-3 h-3 flex-shrink-0 bg-indigo-600 rounded-full self-start sm:self-center" aria-hidden="true"></span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}
