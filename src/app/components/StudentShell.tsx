import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import {
  Bell,
  BookOpen,
  BrainCircuit,
  History,
  LogOut,
  Menu,
  Moon,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuthStore } from "@/stores/auth-store";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";

const primaryNav = [
  ["dashboard", "/student/dashboard", "Dashboard", BrainCircuit],
  ["task", "/student/task", "New session", BookOpen],
  ["history", "/student/history", "History", History],
  ["notifications", "/student/notifications", "Notifications", Bell],
] as const;

const accountNav = [
  ["profile", "/student/profile", "Profile", User],
  ["settings", "/student/settings", "Settings", Settings],
] as const;

export function StudentShell({ active, children }: { active: string; children: ReactNode }) {
  const signOut = useAuthStore((state) => state.signOut);
  const userProfile = useAuthStore((state) => state.userProfile);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = userProfile?.displayName?.trim() || "Student";
  const email = userProfile?.email || "Student account";
  const initials = getInitials(displayName);
  const isDark = resolvedTheme === "dark";

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-950 dark:bg-[#050816] dark:text-slate-100">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800/80 dark:bg-[#0b1120] md:flex">
        <Brand />
        <nav className="mt-9 space-y-1" aria-label="Primary student navigation">
          <NavLinks active={active} items={primaryNav} />
        </nav>
        <div className="mt-auto space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
          <nav className="space-y-1" aria-label="Student account navigation">
            <NavLinks active={active} items={accountNav} />
          </nav>
          <SignOutButton onSignOut={handleSignOut} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-16 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800/80 dark:bg-[#0b1120]/95 sm:px-6">
          <div className="mr-3 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open student navigation"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="flex w-[min(20rem,88vw)] flex-col border-slate-200 bg-white p-5 text-slate-950 dark:border-slate-800 dark:bg-[#0b1120] dark:text-slate-100"
              >
                <SheetHeader className="text-left">
                  <SheetTitle className="sr-only">Student navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate between MINDGUIDE student pages.
                  </SheetDescription>
                  <Brand />
                </SheetHeader>
                <nav className="mt-8 space-y-1" aria-label="Mobile student navigation">
                  <MobileNavLinks active={active} items={primaryNav} />
                </nav>
                <div className="mt-auto space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <nav className="space-y-1" aria-label="Mobile student account navigation">
                    <MobileNavLinks active={active} items={accountNav} />
                  </nav>
                  <SignOutButton onSignOut={handleSignOut} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-950 dark:text-white sm:text-lg">
              Welcome, {displayName}
              <span aria-hidden="true" className="ml-1.5">👋</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
            className="mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {isDark ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
          </button>

          <Link
            to="/student/profile"
            aria-label={`Open profile for ${displayName}`}
            className="flex shrink-0 items-center gap-3 rounded-xl p-1 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:bg-slate-800"
          >
            <span className="hidden max-w-48 text-right sm:block">
              <span className="block truncate text-sm font-bold text-slate-800 dark:text-slate-100">
                {displayName}
              </span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                {email}
              </span>
            </span>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700 ring-1 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30">
              {initials}
            </span>
          </Link>
        </header>

        <main className="mx-auto w-full max-w-6xl p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}

type NavItem = readonly [
  id: string,
  href: string,
  label: string,
  Icon: typeof BrainCircuit,
];

function Brand() {
  return (
    <Link
      to="/student/dashboard"
      className="flex w-fit items-center gap-2 rounded-lg text-lg font-extrabold tracking-tight text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white"
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-lg shadow-indigo-600/20">
        <BrainCircuit className="h-5 w-5" />
      </span>
      MINDGUIDE
    </Link>
  );
}

function NavLinks({ active, items }: { active: string; items: readonly NavItem[] }) {
  return items.map(([id, href, label, Icon]) => (
    <Link
      key={id}
      to={href}
      aria-current={active === id ? "page" : undefined}
      className={navLinkClass(active === id)}
    >
      <Icon className="h-4.5 w-4.5" />
      {label}
    </Link>
  ));
}

function MobileNavLinks({ active, items }: { active: string; items: readonly NavItem[] }) {
  return items.map(([id, href, label, Icon]) => (
    <SheetClose asChild key={id}>
      <Link
        to={href}
        aria-current={active === id ? "page" : undefined}
        className={navLinkClass(active === id)}
      >
        <Icon className="h-4.5 w-4.5" />
        {label}
      </Link>
    </SheetClose>
  ));
}

function SignOutButton({ onSignOut }: { onSignOut: () => Promise<void> }) {
  return (
    <button
      type="button"
      onClick={() => void onSignOut()}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 dark:text-rose-400 dark:hover:bg-rose-950/30"
    >
      <LogOut className="h-4.5 w-4.5" />
      Sign out
    </button>
  );
}

function navLinkClass(isActive: boolean) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
    isActive
      ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
  }`;
}

function getInitials(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "ST";
}
