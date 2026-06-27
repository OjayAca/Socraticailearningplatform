import { useLocation, useNavigate } from "react-router";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
import { useState } from "react";

const SCREENS = [
  { path: "/", title: "1. Splash / Welcome" },
  { path: "/login", title: "2. Log-In Screen" },
  { path: "/signup", title: "3. Sign-Up Screen" },
  { path: "/role", title: "4. Role Selection" },
  { path: "/student/dashboard", title: "5. Student Dashboard" },
  { path: "/student/task", title: "6. Choose Subject / Start Task" },
  { path: "/session/trigger", title: "7. Answer-Block Filter Trigger" },
  { path: "/session/questioning", title: "8. Guided Questioning Interface" },
  { path: "/session/productive", title: "9. Productive Response" },
  { path: "/session/hints", title: "10. Progressive Hint Screen" },
  { path: "/session/logic-map", title: "11. Real-Time Logic Mapping" },
  { path: "/session/draft", title: "12. Draft Answer Stage" },
  { path: "/session/review", title: "13. Final Guided Review" },
  { path: "/session/log", title: "14. Thinking Log Generation" },
  { path: "/session/confirmation", title: "15. Submission Confirmation" },
  { path: "/teacher/dashboard", title: "16. Teacher Workspace" },
  { path: "/teacher/review", title: "17. Teacher Review Screen" },
];

export function StoryboardNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);

  const currentIndex = SCREENS.findIndex((s) => s.path === location.pathname);
  const prevScreen = currentIndex > 0 ? SCREENS[currentIndex - 1] : null;
  const nextScreen = currentIndex < SCREENS.length - 1 ? SCREENS[currentIndex + 1] : null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-white shadow-xl rounded-full border border-slate-200 px-4 py-2 flex items-center gap-4 z-50 text-sm font-medium">
      <button
        onClick={() => prevScreen && navigate(prevScreen.path)}
        disabled={!prevScreen}
        className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 flex items-center text-slate-600 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 rounded-md transition-colors text-indigo-600 font-semibold"
        >
          <Menu className="w-4 h-4" />
          <span className="hidden sm:inline">
            Screen {currentIndex + 1} of {SCREENS.length}
          </span>
        </button>

        {isOpen && (
          <div className="absolute bottom-full mb-4 left-1/2 -translate-x-1/2 w-72 bg-white border border-slate-200 shadow-2xl rounded-xl py-2 max-h-96 overflow-y-auto">
            {SCREENS.map((screen, idx) => (
              <button
                key={screen.path}
                onClick={() => {
                  navigate(screen.path);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 hover:bg-slate-50 text-sm transition-colors ${
                  location.pathname === screen.path ? "bg-indigo-50 text-indigo-700 font-medium" : "text-slate-700"
                }`}
              >
                {screen.title}
              </button>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={() => nextScreen && navigate(nextScreen.path)}
        disabled={!nextScreen}
        className="p-2 rounded-full hover:bg-slate-100 disabled:opacity-30 flex items-center text-slate-600 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
