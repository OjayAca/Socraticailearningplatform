/**
 * Protected route wrapper that enforces authentication.
 *
 * Wraps route content to redirect unauthenticated users to the login page.
 * Optionally enforces a specific role requirement.
 *
 * @module components/ProtectedRoute
 */

import { Navigate, Outlet, useLocation } from "react-router";
import { useAuthStore } from "@/stores/auth-store";
import { Loader2 } from "lucide-react";
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
 * - If authenticated but no role selected → redirects to `/role`.
 * - If role is required and doesn't match → redirects to the correct dashboard.
 * - Otherwise → renders the child route (`<Outlet />`).
 *
 * @param props - Optional role requirement.
 * @returns The guarded route content or a redirect.
 */
export function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
  const { firebaseUser, userProfile, isLoading } = useAuthStore();
  const location = useLocation();

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

  if (!userProfile?.role && location.pathname !== "/role") {
    return <Navigate to="/role" replace />;
  }

  if (requiredRole && userProfile?.role !== requiredRole) {
    const redirectPath =
      userProfile?.role === "teacher"
        ? "/teacher/dashboard"
        : "/student/dashboard";
    return <Navigate to={redirectPath} replace />;
  }

  return <Outlet />;
}
