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
import { SessionRouteGuard } from "./components/SessionRouteGuard";
import { useSessionStore } from "@/stores/session-store";
import { getSessionPath } from "@/lib/session-routes";

/**
 * Base layout — provides a full-height container for all routes.
 * The StoryboardNav has been removed (it was a Figma prototype artifact).
 */
const Layout = () => (
  <div className="flex flex-col h-screen w-full bg-slate-50 relative overflow-hidden">
    <div className="flex-1 flex flex-col min-h-0">
      <Outlet />
    </div>
  </div>
);

const LegacyTeacherReviewRedirect = () => {
  const { sessionId } = useParams();
  return (
    <Navigate
      to={sessionId ? `/admin/review/${sessionId}` : "/admin/review"}
      replace
    />
  );
};

const SessionIndexRedirect = () => {
  const activeSession = useSessionStore((state) => state.activeSession);
  return (
    <Navigate
      to={
        activeSession
          ? getSessionPath(activeSession.id, activeSession.currentStep)
          : "/student/history"
      }
      replace
    />
  );
};

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
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentDashboard }),
          },
          {
            path: "student/profile",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentProfileScreen }),
          },
          {
            path: "student/settings",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentSettingsScreen }),
          },
          {
            path: "student/history",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentHistoryScreen }),
          },
          {
            path: "student/notifications",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentNotificationsScreen }),
          },
          {
            path: "student/task",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).TaskStart }),
          },
          {
            path: "student/review/:sessionId",
            lazy: async () => ({ Component: (await import("./components/StudentScreens")).StudentReviewScreen }),
          },
          {
            path: "session/:sessionId",
            Component: SessionRouteGuard,
            children: [
              { index: true, Component: SessionIndexRedirect },
              { path: "trigger", lazy: async () => ({ Component: (await import("./components/SessionScreensPart1")).SessionTrigger }) },
              { path: "questioning", lazy: async () => ({ Component: (await import("./components/SessionScreensPart1")).SessionQuestioning }) },
              { path: "hints", lazy: async () => ({ Component: (await import("./components/SessionScreensPart1")).SessionHints }) },
              { path: "logic-map", lazy: async () => ({ Component: (await import("./components/SessionScreensPart1")).SessionLogicMap }) },
              { path: "draft", lazy: async () => ({ Component: (await import("./components/SessionScreensPart2")).SessionDraft }) },
              { path: "review", lazy: async () => ({ Component: (await import("./components/SessionScreensPart2")).SessionReview }) },
              { path: "log", lazy: async () => ({ Component: (await import("./components/SessionScreensPart2")).SessionLog }) },
              { path: "confirmation", lazy: async () => ({ Component: (await import("./components/SessionScreensPart2")).SessionConfirmation }) },
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
          { path: "admin/dashboard", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherDashboard }) },
          { path: "admin/profile", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherProfileScreen }) },
          { path: "admin/settings", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherSettingsScreen }) },
          { path: "admin/submissions", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherSubmissionsScreen }) },
          { path: "admin/notifications", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherNotificationsScreen }) },
          { path: "admin/review/:sessionId", lazy: async () => ({ Component: (await import("./components/TeacherScreens")).TeacherReview }) },
          { path: "admin/review", element: <Navigate to="/admin/submissions" replace /> },
          { path: "teacher/dashboard", element: <Navigate to="/admin/dashboard" replace /> },
          { path: "teacher/profile", element: <Navigate to="/admin/profile" replace /> },
          { path: "teacher/settings", element: <Navigate to="/admin/settings" replace /> },
          { path: "teacher/submissions", element: <Navigate to="/admin/submissions" replace /> },
          { path: "teacher/notifications", element: <Navigate to="/admin/notifications" replace /> },
          { path: "teacher/review/:sessionId?", Component: LegacyTeacherReviewRedirect },
        ],
      },
      { path: "*", Component: NotFound },
    ],
  },
]);
