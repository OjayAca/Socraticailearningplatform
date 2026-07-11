/**
 * Root application component.
 *
 * Initializes the Firebase auth state listener on mount and provides
 * the router. The auth listener runs once and tracks sign-in/sign-out
 * events globally.
 *
 * @module app/App
 */

import { useEffect } from "react";
import { RouterProvider } from "react-router";
import { router } from "./routes";
import { useAuthStore } from "@/stores/auth-store";
import {
  getNotificationActionUrl,
  getNotificationText,
  useNotificationStore,
} from "@/stores/notification-store";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";

import { ThemeProvider } from "next-themes";

/**
 * The top-level App component.
 *
 * @returns The rendered application with routing.
 */
export default function App() {
  const initialize = useAuthStore((state) => state.initialize);
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const userProfile = useAuthStore((state) => state.userProfile);
  const listenToNotifications = useNotificationStore(
    (state) => state.listenToNotifications
  );
  const stopListening = useNotificationStore((state) => state.stopListening);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  useEffect(() => {
    if (!firebaseUser?.uid || !userProfile?.uid) {
      stopListening();
      return;
    }

    return listenToNotifications(firebaseUser.uid, {
      onNotification: (notification) => {
        const notificationState = useNotificationStore.getState();
        if (
          !notificationState.liveAlertPopups ||
          notificationState.isPreferenceLoading
        ) {
          return;
        }

        const { title, message } = getNotificationText(notification);
        const actionUrl = getNotificationActionUrl(
          notification,
          userProfile.role
        );
        toast(title, {
          description: message,
          action: actionUrl
            ? {
                label: "Open",
                onClick: () => void router.navigate(actionUrl),
              }
            : undefined,
        });
      },
      onError: (message) => {
        toast.error("Notifications unavailable", { description: message });
      },
    });
  }, [
    firebaseUser?.uid,
    userProfile?.uid,
    userProfile?.role,
    listenToNotifications,
    stopListening,
  ]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider router={router} />
      <Toaster richColors closeButton position="top-right" />
    </ThemeProvider>
  );
}
