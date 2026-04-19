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

import { ThemeProvider } from "next-themes";

/**
 * The top-level App component.
 *
 * @returns The rendered application with routing.
 */
export default function App() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    const unsubscribe = initialize();
    return unsubscribe;
  }, [initialize]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
