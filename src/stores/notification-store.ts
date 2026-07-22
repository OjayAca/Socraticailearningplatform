import { create } from "zustand";
import type { AppNotification } from "@/types";
import { db, firebaseSetupMessage } from "@/lib/firebase";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  serverTimestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";

type NotificationListenerCallbacks = {
  onNotification?: (notification: AppNotification) => void;
  onError?: (message: string) => void;
};

type NotificationRecord = {
  id: string;
  recipientId?: string;
  userId?: string;
  senderId?: string;
  sessionId?: string;
  eventType?: string;
  type?: string;
  title?: string;
  message?: string;
  read?: boolean;
  actionUrl?: string;
  createdAt?: { toMillis?: () => number };
};

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  listenerUserId: string | null;
  unsubscribeSnapshot: (() => void) | null;
  liveAlertPopups: boolean;
  isPreferenceLoading: boolean;
  isPreferenceSaving: boolean;
  preferenceError: string | null;
  /** Starts the single authenticated notification listener. */
  listenToNotifications: (
    userId: string,
    callbacks?: NotificationListenerCallbacks
  ) => () => void;
  /** Retries the current listener while preserving its toast/error callbacks. */
  retryNotifications: () => void;
  /** Stops the listener and removes all account-scoped state. */
  stopListening: () => void;
  /** Persists the user's live popup preference in their Firestore profile. */
  setLiveAlertPopups: (userId: string, enabled: boolean) => Promise<void>;
  /** Marks a specific notification as read. */
  markAsRead: (notificationId: string) => Promise<void>;
  /** Marks all currently loaded notifications as read. */
  markAllAsRead: () => Promise<void>;
  clearError: () => void;
}

let listenerGeneration = 0;
let activeCallbacks: NotificationListenerCallbacks | undefined;

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  error: null,
  listenerUserId: null,
  unsubscribeSnapshot: null,
  // Popups stay off until the signed-in user's persisted preference is loaded.
  liveAlertPopups: false,
  isPreferenceLoading: false,
  isPreferenceSaving: false,
  preferenceError: null,

  listenToNotifications: (userId, callbacks) => {
    get().unsubscribeSnapshot?.();
    const generation = ++listenerGeneration;
    activeCallbacks = callbacks;
    let receivedInitialSnapshot = false;

    set({
      notifications: [],
      unreadCount: 0,
      isLoading: true,
      error: null,
      listenerUserId: userId,
      unsubscribeSnapshot: null,
      liveAlertPopups: false,
      isPreferenceLoading: true,
      isPreferenceSaving: false,
      preferenceError: null,
    });

    void loadLiveAlertPreference(userId)
      .then((enabled) => {
        if (generation !== listenerGeneration) return;
        set({
          liveAlertPopups: enabled,
          isPreferenceLoading: false,
          preferenceError: null,
        });
      })
      .catch((error) => {
        if (generation !== listenerGeneration) return;
        set({
          // A failed preference read never silently enables popups.
          liveAlertPopups: false,
          isPreferenceLoading: false,
          preferenceError: getNotificationErrorMessage(
            error,
            "Your live alert preference could not be loaded. Popups will remain off until you retry."
          ),
        });
      });

    let unsubscribe = () => {};
    try {
      const notificationsQuery = query(
        collection(requireDb(), "notifications"),
        where("recipientId", "==", userId),
        orderBy("createdAt", "desc")
      );

      unsubscribe = onSnapshot(
        notificationsQuery,
        (snapshot) => {
          if (generation !== listenerGeneration) return;

          const notifications = snapshot.docs
            .map(normalizeNotification)
            .sort(compareNotificationsNewestFirst);
          const unreadCount = notifications.filter(
            (notification) => !getNotificationRecord(notification).read
          ).length;

          set({
            notifications,
            unreadCount,
            isLoading: false,
            error: null,
          });

          if (receivedInitialSnapshot) {
            snapshot
              .docChanges()
              .filter(
                (change) =>
                  change.type === "added" && change.doc.data().read !== true
              )
              .map((change) => normalizeNotification(change.doc))
              .forEach((notification) =>
                activeCallbacks?.onNotification?.(notification)
              );
          }
          receivedInitialSnapshot = true;
        },
        (error) => {
          if (generation !== listenerGeneration) return;
          const message = getNotificationErrorMessage(
            error,
            "Notifications could not be loaded. Check your connection and Firestore permissions, then retry."
          );
          set({ isLoading: false, error: message });
          activeCallbacks?.onError?.(message);
        }
      );
    } catch (error) {
      const message = getNotificationErrorMessage(
        error,
        "Notifications could not be started. Check the Firebase configuration and try again."
      );
      set({ isLoading: false, error: message });
      callbacks?.onError?.(message);
    }

    if (generation === listenerGeneration) {
      set({ unsubscribeSnapshot: unsubscribe });
    } else {
      unsubscribe();
    }

    // App-level cleanup always stops whichever listener is currently active,
    // including one restarted from the notification screen.
    return () => get().stopListening();
  },

  retryNotifications: () => {
    const userId = get().listenerUserId;
    if (userId) {
      get().listenToNotifications(userId, activeCallbacks);
    }
  },

  stopListening: () => {
    ++listenerGeneration;
    get().unsubscribeSnapshot?.();
    activeCallbacks = undefined;
    set({
      notifications: [],
      unreadCount: 0,
      isLoading: false,
      error: null,
      listenerUserId: null,
      unsubscribeSnapshot: null,
      liveAlertPopups: false,
      isPreferenceLoading: false,
      isPreferenceSaving: false,
      preferenceError: null,
    });
  },

  setLiveAlertPopups: async (userId, enabled) => {
    if (userId !== get().listenerUserId) {
      const error = new Error(
        "The signed-in account changed. Reload settings before saving this preference."
      );
      set({ preferenceError: error.message, isPreferenceSaving: false });
      throw error;
    }

    set({ isPreferenceSaving: true, preferenceError: null });
    try {
      await updateDoc(doc(requireDb(), "users", userId), {
        "preferences.liveAlertPopups": enabled,
        updatedAt: serverTimestamp(),
      });
      if (userId === get().listenerUserId) {
        set({
          liveAlertPopups: enabled,
          isPreferenceSaving: false,
          preferenceError: null,
        });
      }
    } catch (error) {
      const message = getNotificationErrorMessage(
        error,
        "Your live alert preference could not be saved. Try again."
      );
      set({ isPreferenceSaving: false, preferenceError: message });
      throw new Error(message);
    }
  },

  markAsRead: async (notificationId) => {
    set({ error: null });
    try {
      await updateDoc(doc(requireDb(), "notifications", notificationId), {
        read: true,
      });
    } catch (error) {
      const message = getNotificationErrorMessage(
        error,
        "This notification could not be marked as read. Try again."
      );
      set({ error: message });
      throw new Error(message);
    }
  },

  markAllAsRead: async () => {
    const unreadNotifications = get().notifications.filter(
      (notification) => !getNotificationRecord(notification).read
    );
    if (unreadNotifications.length === 0) return;

    set({ error: null });
    try {
      await Promise.all(
        unreadNotifications.map((notification) =>
          updateDoc(
            doc(requireDb(), "notifications", getNotificationRecord(notification).id),
            { read: true }
          )
        )
      );
    } catch (error) {
      const message = getNotificationErrorMessage(
        error,
        "Some notifications could not be marked as read. Retry after the list refreshes."
      );
      set({ error: message });
      throw new Error(message);
    }
  },

  clearError: () => set({ error: null, preferenceError: null }),
}));

/** Maps a typed notification event to an internal route. */
export function getNotificationActionUrl(
  notification: AppNotification,
  role: unknown
): string | undefined {
  const record = getNotificationRecord(notification);
  const eventType = record.eventType ?? record.type;
  const encodedSessionId = record.sessionId
    ? encodeURIComponent(record.sessionId)
    : null;

  if (eventType === "session_submitted" && encodedSessionId) {
    return role === "admin" || role === "teacher"
      ? `/admin/review/${encodedSessionId}`
      : undefined;
  }

  if (
    (eventType === "session_reviewed" || eventType === "session_returned") &&
    role === "student"
  ) {
    return encodedSessionId
      ? `/student/review/${encodedSessionId}`
      : "/student/history";
  }

  // Keep migrated legacy notifications useful, but only allow local routes.
  return isSafeInternalRoute(record.actionUrl) ? record.actionUrl : undefined;
}

export function getNotificationText(notification: AppNotification): {
  title: string;
  message: string;
} {
  const record = getNotificationRecord(notification);
  if (record.title && record.message) {
    return { title: record.title, message: record.message };
  }

  switch (record.eventType ?? record.type) {
    case "session_submitted":
      return {
        title: "New student submission",
        message: "A student session is ready for administrator review.",
      };
    case "session_reviewed":
      return {
        title: "Session reviewed",
        message: "Your administrator review is ready in your thinking log.",
      };
    case "session_returned":
      return {
        title: "Session returned",
        message: "Your administrator left guidance for a follow-up attempt.",
      };
    default:
      return {
        title: record.title || "MINDGUIDE update",
        message: record.message || "There is a new update in your account.",
      };
  }
}

function normalizeNotification(
  snapshot: QueryDocumentSnapshot<DocumentData>
): AppNotification {
  const data = snapshot.data() as Omit<NotificationRecord, "id">;
  const recipientId = data.recipientId ?? data.userId ?? "";

  return {
    ...data,
    id: snapshot.id,
    recipientId,
    // Retained at runtime so migrated and pre-migration UI code can coexist.
    userId: data.userId ?? recipientId,
    eventType: data.eventType ?? data.type,
    read: data.read === true,
  } as unknown as AppNotification;
}

function compareNotificationsNewestFirst(
  left: AppNotification,
  right: AppNotification
): number {
  return getCreatedAtMillis(right) - getCreatedAtMillis(left);
}

function getCreatedAtMillis(notification: AppNotification): number {
  return getNotificationRecord(notification).createdAt?.toMillis?.() ?? 0;
}

function getNotificationRecord(notification: AppNotification): NotificationRecord {
  return notification as unknown as NotificationRecord;
}

function isSafeInternalRoute(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

async function loadLiveAlertPreference(userId: string): Promise<boolean> {
  const snapshot = await getDoc(doc(requireDb(), "users", userId));
  if (!snapshot.exists()) {
    throw new Error("Your user profile no longer exists in Firestore.");
  }

  const data = snapshot.data() as {
    preferences?: {
      liveAlertPopups?: unknown;
      /** @deprecated Pre-v2 preference key. */
      liveAlertsEnabled?: unknown;
    };
    liveAlertsEnabled?: unknown;
  };
  const stored =
    data.preferences?.liveAlertPopups ??
    data.preferences?.liveAlertsEnabled ??
    data.liveAlertsEnabled;

  // New and legacy profiles default to live popups enabled. Once the user
  // changes the switch, the explicit value is persisted in Firestore.
  return typeof stored === "boolean" ? stored : true;
}

function requireDb() {
  if (!db) {
    throw new Error(firebaseSetupMessage);
  }
  return db;
}

function getNotificationErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (error instanceof Error && error.message === firebaseSetupMessage) {
    return firebaseSetupMessage;
  }

  if (typeof error === "object" && error !== null && "code" in error) {
    const code = String((error as { code: unknown }).code);
    if (code.includes("permission-denied")) {
      return "Firestore denied notification access. Sign in again or verify the deployed security rules.";
    }
    if (code.includes("failed-precondition")) {
      return "The notification query needs its Firestore index. Deploy firestore.indexes.json, then retry.";
    }
    if (code.includes("unavailable")) {
      return "Notifications are temporarily offline. Check your connection and retry.";
    }
  }

  return fallback;
}
