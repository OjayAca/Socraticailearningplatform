/**
 * Application route definitions.
 *
 * Routes are organized into two groups:
 * 1. Public routes (splash, login, signup)
 * 2. Role-protected routes (student/*, teacher/*, session/*)
 *
 * @module app/routes
 */

import { createBrowserRouter, Outlet } from "react-router";
import { Splash, Login, SignUp } from "./components/AuthScreens";
import { StudentDashboard, TaskStart, StudentProfileScreen, StudentSettingsScreen, StudentHistoryScreen, StudentNotificationsScreen } from "./components/StudentScreens";
import {
  SessionTrigger,
  SessionQuestioning,
  SessionProductive,
  SessionHints,
  SessionLogicMap,
  SessionDraft,
  SessionReview,
  SessionLog,
  SessionConfirmation,
} from "./components/SessionScreens";
import { TeacherDashboard, TeacherReview, TeacherProfileScreen, TeacherSettingsScreen, TeacherSubmissionsScreen, TeacherNotificationsScreen } from "./components/TeacherScreens";
import { ProtectedRoute } from "./components/ProtectedRoute";

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

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      // ── Public Routes ──────────────────────────────────
      { index: true, Component: Splash },
      { path: "login", Component: Login },
      { path: "signup", Component: SignUp },

      // ── Student Routes ─────────────────────────────────
      {
        element: <ProtectedRoute requiredRole="student" />,
        children: [
          { path: "student/dashboard", Component: StudentDashboard },
          { path: "student/profile", Component: StudentProfileScreen },
          { path: "student/settings", Component: StudentSettingsScreen },
          { path: "student/history", Component: StudentHistoryScreen },
          { path: "student/notifications", Component: StudentNotificationsScreen },
          { path: "student/task", Component: TaskStart },
          { path: "session/trigger", Component: SessionTrigger },
          { path: "session/questioning", Component: SessionQuestioning },
          { path: "session/productive", Component: SessionProductive },
          { path: "session/hints", Component: SessionHints },
          { path: "session/logic-map", Component: SessionLogicMap },
          { path: "session/draft", Component: SessionDraft },
          { path: "session/review", Component: SessionReview },
          { path: "session/log", Component: SessionLog },
          { path: "session/confirmation", Component: SessionConfirmation },
        ],
      },

      // ── Teacher Routes ─────────────────────────────────
      {
        element: <ProtectedRoute requiredRole="teacher" />,
        children: [
          { path: "teacher/dashboard", Component: TeacherDashboard },
          { path: "teacher/profile", Component: TeacherProfileScreen },
          { path: "teacher/settings", Component: TeacherSettingsScreen },
          { path: "teacher/submissions", Component: TeacherSubmissionsScreen },
          { path: "teacher/notifications", Component: TeacherNotificationsScreen },
          { path: "teacher/review/:sessionId?", Component: TeacherReview },
        ],
      },
    ],
  },
]);
