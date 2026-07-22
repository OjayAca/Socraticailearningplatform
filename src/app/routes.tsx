/**
 * Application route definitions.
 *
 * Routes are organized into two groups:
 * 1. Public routes (splash, login, signup)
 * 2. Role-protected routes (student/*, admin/*, session/*)
 *
 * @module app/routes
 */

import {
  createBrowserRouter,
  Link,
  Navigate,
  Outlet,
  useParams,
} from "react-router";
import { ArrowLeft, SearchX } from "lucide-react";
import { ProtectedRoute } from "./components/ProtectedRoute";

/**
 * Base layout — provides a full-height container for all routes.
 * The StoryboardNav has been removed (it was a Figma prototype artifact).
 */
const Layout = () => (
  <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-slate-50">
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
      <Outlet />
    </div>
  </div>
);

const LegacyAdministratorReviewRedirect = () => {
  const { sessionId } = useParams();
  return (
    <Navigate
      to={sessionId ? `/admin/review/${sessionId}` : "/admin/review"}
      replace
    />
  );
};

const SessionIndexRedirect = () => {
  const { sessionId } = useParams();
  return <Navigate to={sessionId ? `/session/${sessionId}/learn` : "/student/history"} replace />;
};

const LegacySessionStepRedirect = () => <SessionIndexRedirect />;

const NotFound = () => (
  <div className="flex flex-1 items-center justify-center bg-slate-50 p-6">
    <div className="max-w-md rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
      <SearchX className="mx-auto h-12 w-12 text-slate-400" />
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-500">
        The page may have moved, or the link is no longer valid.
      </p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Return home
      </Link>
    </div>
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      // ── Public Routes ──────────────────────────────────
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./components/AuthScreens")).Splash,
        }),
      },
      {
        path: "login",
        lazy: async () => ({
          Component: (await import("./components/AuthScreens")).Login,
        }),
      },
      {
        path: "signup",
        lazy: async () => ({
          Component: (await import("./components/AuthScreens")).SignUp,
        }),
      },

      // ── Student Routes ─────────────────────────────────
      {
        element: <ProtectedRoute requiredRole="student" />,
        children: [
          {
            path: "student/dashboard",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentDashboard }),
          },
          {
            path: "student/profile",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentProfile }),
          },
          {
            path: "student/settings",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentSettings }),
          },
          {
            path: "student/history",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentHistory }),
          },
          {
            path: "student/notifications",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentNotifications }),
          },
          {
            path: "student/task",
            lazy: async () => ({ Component: (await import("./components/SecureTaskStart")).SecureTaskStart }),
          },
          {
            path: "student/review/:sessionId",
            lazy: async () => ({ Component: (await import("./components/SecureStudent")).SecureStudentReview }),
          },
          {
            path: "session/:sessionId",
            children: [
              { index: true, Component: SessionIndexRedirect },
              { path: "learn", lazy: async () => ({ Component: (await import("./components/SecureSession")).SecureSession }) },
              { path: "trigger", Component: LegacySessionStepRedirect },
              { path: "questioning", Component: LegacySessionStepRedirect },
              { path: "hints", Component: LegacySessionStepRedirect },
              { path: "logic-map", Component: LegacySessionStepRedirect },
              { path: "draft", Component: LegacySessionStepRedirect },
              { path: "review", Component: LegacySessionStepRedirect },
              { path: "log", Component: LegacySessionStepRedirect },
              { path: "confirmation", Component: LegacySessionStepRedirect },
            ],
          },
          { path: "session/trigger", element: <Navigate to="/student/history" replace /> },
          { path: "session/questioning", element: <Navigate to="/student/history" replace /> },
          { path: "session/hints", element: <Navigate to="/student/history" replace /> },
          { path: "session/logic-map", element: <Navigate to="/student/history" replace /> },
          { path: "session/draft", element: <Navigate to="/student/history" replace /> },
          { path: "session/review", element: <Navigate to="/student/history" replace /> },
          { path: "session/log", element: <Navigate to="/student/history" replace /> },
          { path: "session/confirmation", element: <Navigate to="/student/history" replace /> },
        ],
      },

      // ── System Admin Routes ─────────────────────────────────
      {
        element: <ProtectedRoute requiredRole="admin" />,
        children: [
          { path: "admin/dashboard", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminDashboard }) },
          { path: "admin/users", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminUsers }) },
          { path: "admin/content/:collection", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminContent }) },
          { path: "admin/reports", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminReports }) },
          { path: "admin/logs", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminLogs }) },
          { path: "admin/settings", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminSettings }) },
          { path: "admin/maintenance", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminMaintenance }) },
          { path: "admin/review/:sessionId", lazy: async () => ({ Component: (await import("./components/SecureAdmin")).SecureAdminReview }) },
          { path: "admin/profile", element: <Navigate to="/admin/settings" replace /> },
          { path: "admin/submissions", element: <Navigate to="/admin/dashboard" replace /> },
          { path: "admin/notifications", element: <Navigate to="/admin/dashboard" replace /> },
          { path: "admin/review", element: <Navigate to="/admin/dashboard" replace /> },
          { path: "teacher/dashboard", element: <Navigate to="/admin/dashboard" replace /> },
          { path: "teacher/profile", element: <Navigate to="/admin/profile" replace /> },
          { path: "teacher/settings", element: <Navigate to="/admin/settings" replace /> },
          { path: "teacher/submissions", element: <Navigate to="/admin/submissions" replace /> },
          { path: "teacher/notifications", element: <Navigate to="/admin/notifications" replace /> },
          { path: "teacher/review/:sessionId?", Component: LegacyAdministratorReviewRedirect },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
]);
