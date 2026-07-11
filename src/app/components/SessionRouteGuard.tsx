import { useEffect, useRef } from "react";
import { Link, Navigate, Outlet, useParams } from "react-router";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";
import { useSessionStore } from "@/stores/session-store";

export function SessionRouteGuard() {
  const { sessionId } = useParams();
  const firebaseUser = useAuthStore((state) => state.firebaseUser);
  const activeSession = useSessionStore((state) => state.activeSession);
  const isLoading = useSessionStore((state) => state.isLoading);
  const error = useSessionStore((state) => state.error);
  const loadSession = useSessionStore((state) => state.loadSession);
  const clearError = useSessionStore((state) => state.clearError);
  const requestedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionId || !firebaseUser) return;
    if (activeSession?.id === sessionId) return;
    if (requestedRef.current === sessionId) return;

    requestedRef.current = sessionId;
    clearError();
    void loadSession(sessionId, firebaseUser.uid).catch(() => {
      // The store exposes the actionable error below.
    });
  }, [activeSession?.id, clearError, firebaseUser, loadSession, sessionId]);

  if (!sessionId) {
    return <Navigate to="/student/history" replace />;
  }

  if (isLoading || activeSession?.id !== sessionId) {
    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
          <div className="max-w-md rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-10 w-10 text-amber-500" />
            <h1 className="text-xl font-bold text-slate-900">Session unavailable</h1>
            <p className="mt-2 text-sm text-slate-600">{error}</p>
            <Link
              to="/student/history"
              className="mt-6 inline-flex rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Back to previous sessions
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-1 items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (!firebaseUser || activeSession.studentId !== firebaseUser.uid) {
    return <Navigate to="/student/history" replace />;
  }

  return <Outlet />;
}
