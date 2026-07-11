/**
 * Protected route wrapper that enforces authentication.
 *
 * Wraps route content to redirect unauthenticated users to the login page.
 * Optionally enforces a specific role requirement.
 *
 * @module components/ProtectedRoute
 */

import { Navigate, Outlet } from "react-router";
import {
  getDashboardPath,
  isAdminRole,
  useAuthStore,
} from "@/stores/auth-store";
import { AlertCircle, Loader2, LogOut, RefreshCw } from "lucide-react";
import type { UserRole } from "@/types";

interface ProtectedRouteProps {
  /** If set, only users with this role can access the route. */
  requiredRole?: UserRole;
}

/**
 * Route guard component.
 *
 * - If auth is still loading → shows a spinner.
 * - If not authenticated → redirects to `/login`.
 * - If authenticated but the profile failed to load → provides recovery actions.
 * - If role is required and doesn't match → redirects to the correct dashboard.
 * - Otherwise → renders the child route (`<Outlet />`).
 *
 * @param props - Optional role requirement.
 * @returns The guarded route content or a redirect.
 */
export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const {
    firebaseUser,
    userProfile,
    isLoading,
    error,
    reloadProfile,
    signOut,
  } = useAuthStore();

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-slate-500 text-sm font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return <Navigate to="/login" replace />;
  }

  if (!userProfile) {
    return (
      <div className="flex-1 flex items-center justify-center h-full bg-slate-50 dark:bg-slate-950 p-6">
        <div className="w-full max-w-lg rounded-3xl border border-red-200 dark:border-red-900 bg-white dark:bg-slate-900 p-8 shadow-sm text-center">
          <AlertCircle className="w-10 h-10 text-red-600 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            We could not load your account profile
          </h1>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
            {error ||
              "Your Firebase sign-in succeeded, but the Firestore profile is unavailable."}
          </p>
          <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button
              type="button"
              onClick={() => void reloadProfile().catch(() => undefined)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <RefreshCw className="w-4 h-4" />
              Retry profile
            </button>
            <button
              type="button"
              onClick={() => void signOut().catch(() => undefined)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-5 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const profileRole = userProfile.role;

  if (requiredRole && !rolesMatch(profileRole, requiredRole)) {
    return <Navigate to={getDashboardPath(profileRole)} replace />;
  }

  return <Outlet />;
}

function rolesMatch(profileRole: unknown, requiredRole: unknown): boolean {
  return (
    profileRole === requiredRole ||
    (isAdminRole(profileRole) && isAdminRole(requiredRole))
  );
}
