import { createBrowserRouter, Link, Outlet } from "react-router";
import { Splash, Login, SignUp, RoleSelection } from "./components/AuthScreens";
import { StudentDashboard, TaskStart } from "./components/StudentScreens";
import { SessionTrigger, SessionQuestioning, SessionProductive, SessionHints, SessionLogicMap, SessionDraft, SessionReview, SessionLog, SessionConfirmation } from "./components/SessionScreens";
import { TeacherDashboard, TeacherReview } from "./components/TeacherScreens";
import { StoryboardNav } from "./components/StoryboardNav";

const Layout = () => (
  <div className="flex flex-col h-screen w-full bg-slate-50 relative overflow-hidden">
    <div className="flex-1 flex flex-col min-h-0">
      <Outlet />
    </div>
    <StoryboardNav />
  </div>
);

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Layout,
    children: [
      { index: true, Component: Splash },
      { path: "login", Component: Login },
      { path: "signup", Component: SignUp },
      { path: "role", Component: RoleSelection },
      { path: "student/dashboard", Component: StudentDashboard },
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
      { path: "teacher/dashboard", Component: TeacherDashboard },
      { path: "teacher/review", Component: TeacherReview },
    ],
  },
]);
