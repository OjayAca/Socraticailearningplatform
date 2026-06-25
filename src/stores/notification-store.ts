import { create } from "zustand";
import { AppNotification } from "@/types";
import { db, firebaseSetupMessage } from "@/lib/firebase";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  updateDoc,
  doc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  unsubscribeSnapshot: (() => void) | null;
  /** Starts looking at the notifications collection for the specific user id */
  listenToNotifications: (userId: string) => void;
  /** Marks a specific notification as read */
  markAsRead: (notificationId: string) => Promise<void>;
  /** Marks all notifications as read */
  markAllAsRead: () => Promise<void>;
  /** Mock function to dump a notification (strictly for MVP testing / showcase) */
  generateMockNotification: (userId: string, isTeacher: boolean) => Promise<void>;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: true,
  unsubscribeSnapshot: null,

  listenToNotifications: (userId: string) => {
    const database = db;
    if (!database) {
      set({ isLoading: false });
      return;
    }

    // Unsubscribe if one is already running
    const prevUnsub = get().unsubscribeSnapshot;
    if (prevUnsub) prevUnsub();

    set({ isLoading: true });

    const q = query(
      collection(database, "notifications"),
      where("userId", "==", userId),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allNotifs = snapshot.docs.map(
        (d) =>
          ({
            id: d.id,
            ...d.data(),
          } as AppNotification)
      );

      const unread = allNotifs.filter((n) => !n.read).length;

      set({
        notifications: allNotifs,
        unreadCount: unread,
        isLoading: false,
      });
    });

    set({ unsubscribeSnapshot: unsubscribe });
  },

  markAsRead: async (notificationId: string) => {
    const notificationRef = doc(requireDb(), "notifications", notificationId);
    await updateDoc(notificationRef, { read: true });
  },

  markAllAsRead: async () => {
    const state = get();
    const unreadNotifications = state.notifications.filter((n) => !n.read);
    
    // Process them in parallel
    await Promise.all(
      unreadNotifications.map((n) =>
        updateDoc(doc(requireDb(), "notifications", n.id), { read: true })
      )
    );
  },

  generateMockNotification: async (userId: string, isTeacher: boolean) => {
    await addDoc(collection(requireDb(), "notifications"), {
      userId,
      title: isTeacher ? "New Student Submission" : "Socratic Review Ready",
      message: isTeacher
        ? "Alex just submitted their analysis on Quantum Entanglement."
        : "Your teacher has reviewed your session on React Hooks.",
      read: false,
      actionUrl: isTeacher ? "/teacher/submissions" : "/student/history",
      createdAt: serverTimestamp(),
    });
  },
}));

function requireDb() {
  if (!db) {
    throw new Error(firebaseSetupMessage);
  }
  return db;
}
