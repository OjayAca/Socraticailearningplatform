import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  Bell,
  BookOpen,
  BrainCircuit,
  History,
  LogOut,
  Settings,
  User,
} from "lucide-react";
import { useAuthStore } from "@/stores/auth-store";

export function StudentShell({ active, children }: { active: string; children: ReactNode }) {
  const signOut = useAuthStore((state) => state.signOut);
  const navigate = useNavigate();
  const nav = [
    ["dashboard", "/student/dashboard", "Dashboard", BrainCircuit],
    ["task", "/student/task", "New session", BookOpen],
    ["history", "/student/history", "History", History],
    ["notifications", "/student/notifications", "Notifications", Bell],
    ["profile", "/student/profile", "Profile", User],
    ["settings", "/student/settings", "Settings", Settings],
  ] as const;

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden min-h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white p-5 text-slate-900 md:flex">
        <div className="flex items-center gap-2 text-xl font-bold">
          <BrainCircuit className="h-7 w-7 text-indigo-600" />
          MINDGUIDE
        </div>
        <nav className="mt-8 space-y-1">
          {nav.map(([id, href, label, Icon]) => (
            <Link
              key={id}
              to={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${
                active === id
                  ? "bg-indigo-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <button
          onClick={() => void signOut().then(() => navigate("/login"))}
          className="mt-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
