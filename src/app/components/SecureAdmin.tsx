import { AdminPrivacySettings } from "./AdminPrivacySettings";
import { PilotControls } from "./PilotControls";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { collection, doc, getDoc, getDocs, getCountFromServer, limit, orderBy, query, where, startAfter, type QueryDocumentSnapshot, type DocumentData } from "firebase/firestore";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router";
import {
  Activity,
  AlertCircle,
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  ClipboardList,
  Database,
  Download,
  FileWarning,
  LayoutDashboard,
  Loader2,
  LogOut,
  Menu,
  Moon,
  Printer,
  Settings,
  Sparkles,
  Sun,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import type { LearningProgress, ReportExportResponse, ReportKind } from "@mindguide/contracts";
import { db } from "@/lib/firebase";
import {
  adminExportReport,
  adminManageUser,
  adminOverrideSessionSupport,
  adminPublishAnnouncement,
  adminQueryReport,
  adminReviewSession,
} from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";
import { CONTENT_COLLECTIONS, ManagedContentEditor, type ContentCollection } from "./ManagedContentEditor";
import { MindGuideLogo } from "./MindGuideLogo";
import { NotificationContent } from "./student/NotificationContent";
import { ProfileContent } from "./student/ProfileContent";
import { ScorecardDetails } from "./ScorecardDetails";
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
  ["dashboard", "/admin/dashboard", "Dashboard", LayoutDashboard],
  ["users", "/admin/users", "Users", Users],
  ["progress", "/admin/progress", "Learner progress", BarChart3],
  ["content", "/admin/content/problems", "Content", BookOpen],
  ["reports", "/admin/reports", "Reports", BarChart3],
  ["notifications", "/admin/notifications", "Notifications", Bell],
  ["logs", "/admin/logs", "Audit & AI", Activity],
  ["maintenance", "/admin/maintenance", "Maintenance", Database],
] as const;

const accountNav = [
  ["profile", "/admin/profile", "Profile", User],
  ["settings", "/admin/settings", "Settings", Settings],
] as const;

type NavItem = readonly [
  id: string,
  href: string,
  label: string,
  Icon: LucideIcon,
];

function AdminBrand() {
  return (
    <Link
      to="/admin/dashboard"
      className="flex w-fit items-center gap-2.5 rounded-lg text-lg font-extrabold tracking-tight text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:text-white"
    >
      <MindGuideLogo decorative className="h-10 w-11 rounded-xl bg-white shadow-sm" />
      <span className="flex items-center gap-2">
        MINDGUIDE
        <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
          Admin
        </span>
      </span>
    </Link>
  );
}

function AdminNavLinks({ active, items }: { active: string; items: readonly NavItem[] }) {
  return items.map(([id, href, label, Icon]) => (
    <Link
      key={id}
      to={href}
      aria-current={active === id ? "page" : undefined}
      className={adminNavLinkClass(active === id)}
    >
      <Icon className="h-4.5 w-4.5" />
      {label}
    </Link>
  ));
}

function MobileAdminNavLinks({ active, items }: { active: string; items: readonly NavItem[] }) {
  return items.map(([id, href, label, Icon]) => (
    <SheetClose asChild key={id}>
      <Link
        to={href}
        aria-current={active === id ? "page" : undefined}
        className={adminNavLinkClass(active === id)}
      >
        <Icon className="h-4.5 w-4.5" />
        {label}
      </Link>
    </SheetClose>
  ));
}

function adminNavLinkClass(isActive: boolean) {
  return `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${isActive
    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-slate-100"
    }`;
}

function AdminSignOutButton({ onSignOut }: { onSignOut: () => Promise<void> }) {
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

function getInitials(displayName: string) {
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return initials || "AD";
}

function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  const signOut = useAuthStore((state) => state.signOut);
  const userProfile = useAuthStore((state) => (state as { userProfile?: { displayName?: string; email?: string } }).userProfile);
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const displayName = userProfile?.displayName?.trim() || "System Admin";
  const email = userProfile?.email || "Admin Console";
  const initials = getInitials(displayName);
  const isDark = resolvedTheme === "dark";
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    try {
      await signOut();
      navigate("/login");
    } catch (cause) { setSignOutError(errorMessage(cause, "Sign out failed. Please try again.")); }
  }

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-slate-50 text-slate-950 dark:bg-[#050816] dark:text-slate-100">
      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white px-4 py-5 dark:border-slate-800/80 dark:bg-[#0b1120] md:flex">
        <AdminBrand />
        <nav className="mt-8 space-y-1" aria-label="Primary administrator navigation">
          <AdminNavLinks active={active} items={primaryNav} />
        </nav>
        <div className="mt-auto space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
          <nav className="space-y-1" aria-label="Administrator account navigation">
            <AdminNavLinks active={active} items={accountNav} />
          </nav>
          <AdminSignOutButton onSignOut={handleSignOut} />
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {signOutError && <div role="alert" className="bg-red-50 p-3 text-red-800">{signOutError}</div>}
        <header className="z-30 flex h-16 shrink-0 items-center border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800/80 dark:bg-[#0b1120]/95 sm:px-6">
          <div className="mr-3 md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  type="button"
                  aria-label="Open administrator navigation"
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
                  <SheetTitle className="sr-only">Administrator navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Navigate between MINDGUIDE administrator console pages.
                  </SheetDescription>
                  <AdminBrand />
                </SheetHeader>
                <nav className="mt-8 space-y-1" aria-label="Mobile administrator navigation">
                  <MobileAdminNavLinks active={active} items={primaryNav} />
                </nav>
                <div className="mt-auto space-y-1 border-t border-slate-200 pt-4 dark:border-slate-800">
                  <nav className="space-y-1" aria-label="Mobile administrator account navigation">
                    <MobileAdminNavLinks active={active} items={accountNav} />
                  </nav>
                  <AdminSignOutButton onSignOut={handleSignOut} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-slate-950 dark:text-white sm:text-lg">
              Welcome, {displayName}
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
            to="/admin/profile"
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

        <main className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function SecureAdminDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db) return;
    Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "sessions"), orderBy("updatedAt", "desc"), limit(50))),
      getDocs(collection(db, "problems")),
      getCountFromServer(collection(db, "audit_logs")),
      getCountFromServer(collection(db, "sessions")),
      getCountFromServer(query(collection(db, "sessions"), where("status", "==", "submitted"))),
    ])
      .then(([usersSnapshot, sessionsSnapshot, problemSnapshot, auditSnapshot, sessionCount, pendingCount]) => {
        const values: Record<string, any>[] = sessionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        setSessions(values);
        setCounts({
          users: usersSnapshot.size,
          sessions: sessionCount.data().count,
          problems: problemSnapshot.size,
          audits: auditSnapshot.data().count,
          pending: pendingCount.data().count,
        });
      })
      .catch((cause) => setError(errorMessage(cause, "Administrator data could not be loaded.")))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AdminShell active="dashboard">
      <div className="space-y-6">
        <PageTitle
          title="System Administrator Dashboard"
          description="Monitor learner practice records, managed content, reports, and security activity."
        />

        {error && <ErrorBox message={error} />}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Administrator platform metrics">
          <AdminStat
            label="User accounts"
            value={counts.users ?? 0}
            Icon={Users}
            iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
          />
          <AdminStat
            label="Learner sessions"
            value={counts.sessions ?? 0}
            Icon={BrainCircuit}
            iconClassName="bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400"
          />
          <AdminStat
            label="Problem bank"
            value={counts.problems ?? 0}
            Icon={BookOpen}
            iconClassName="bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400"
          />
          <AdminStat
            label="Audit records"
            value={counts.audits ?? 0}
            Icon={Activity}
            iconClassName="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          />
          <AdminStat
            label="Pending reviews"
            value={counts.pending ?? 0}
            Icon={AlertCircle}
            iconClassName="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400"
          />
        </section>

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-violet-600 to-blue-600 px-5 py-6 text-white shadow-xl shadow-indigo-600/20 sm:px-7">
          <div className="pointer-events-none absolute -right-12 -top-20 h-52 w-52 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-cyan-300/20 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 flex items-center gap-2 text-indigo-100">
                <Sparkles className="h-4 w-4" />
                <span className="text-xs font-bold uppercase tracking-[0.16em]">System Administration</span>
              </div>
              <h2 className="text-xl font-bold sm:text-2xl">Quantitative & Discrete Reasoning Administration</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100">
                Oversee formative practice records, manage academic user profiles, review submitted formative sessions, and export audited reports.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 sm:self-center">
              <Link
                to="/admin/users"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-indigo-700 shadow-md transition hover:-translate-y-0.5 hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Users className="h-4 w-4" />
                Manage users
              </Link>
              <Link
                to="/admin/content/problems"
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-indigo-500/30 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:-translate-y-0.5 hover:bg-indigo-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <BookOpen className="h-4 w-4" />
                Curriculum
              </Link>
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
            <h2 className="font-bold text-slate-950 dark:text-white">Recent learner sessions</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Learner reasoning submissions, scored activities, and review queues.
            </p>
          </div>
          {loading ? (
            <Spinner />
          ) : sessions.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                <BookOpen className="h-6 w-6" />
              </span>
              <p className="mt-4 font-semibold text-slate-700 dark:text-slate-300">No learner sessions recorded yet.</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Learner submissions will appear here automatically.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {sessions.slice(0, 20).map((session) => (
                <Link
                  key={session.id}
                  to={`/admin/review/${session.id}`}
                  className="grid gap-2 px-5 py-4 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
                >
                  <span className="font-semibold text-slate-900 dark:text-slate-100">{session.studentName ?? "Learner"}</span>
                  <span className="line-clamp-2 text-sm text-slate-600 dark:text-slate-400">{session.subject} · {session.topic}</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">{session.scorecard?.total ?? session.ctScore ?? "—"}</span>
                  <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(session.status)}`}>
                    {String(session.status).replace(/_/g, " ")}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

export function SecureAdminUsers() {
  const [usersList, setUsersList] = useState<Record<string, any>[]>([]);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("Authorized capstone account administration");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!db) return;
    setLoading(true);
    setError(null);
    try {
      const snapshot = await getDocs(collection(db, "users"));
      setUsersList(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
    } catch (cause) {
      setError(errorMessage(cause, "User accounts could not be loaded."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filtered = useMemo(
    () => usersList.filter((user) => searchableUser(user).includes(search.toLowerCase())),
    [search, usersList]
  );

  async function act(
    userId: string,
    action: "suspend" | "activate" | "deactivate"
  ) {
    setMessage(null);
    try {
      await adminManageUser({ userId, action, reason });
      setMessage(`Account action '${action}' completed.`);
      await load();
    } catch (cause) {
      setMessage(errorMessage(cause, "User action failed."));
    }
  }

  return (
    <AdminShell active="users">
      <PageTitle
        title="User Account Management"
        description="Search learner profiles and manage application access. Use Firebase Console for privileged Authentication operations."
      />
      {error && <ErrorBox message={error} />}
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name, email, student number, course, year, or section"
          className="rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Required audit reason"
          className="rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
        />
      </div>
      {message && <Message text={message} />}
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">Delete Auth accounts or reset access in <a className="underline" href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/authentication/users`} target="_blank" rel="noreferrer">Firebase Console</a>. Role changes require an authorized operator to update both custom claims and the Firestore profile; they cannot be performed by this browser.</p>
      {loading ? (
        <Spinner />
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="p-4">Account and academic profile</th>
                  <th className="p-4">Role</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((user) => (
                  <tr key={user.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-4">
                      <p className="font-bold text-slate-900 dark:text-slate-100">{user.displayName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{user.email}</p>
                    </td>
                    <td className="p-4">
                      <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(user.status ?? "active")}`}>
                        {user.status ?? "active"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        <Action onClick={() => void act(user.id, user.status === "suspended" ? "activate" : "suspend")}>
                          {user.status === "suspended" ? "activate" : "suspend"}
                        </Action>
                        {user.status !== "deactivated" && user.status !== "anonymized" && (
                          <Action onClick={() => void act(user.id, "deactivate")}>deactivate</Action>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export function SecureAdminContent() {
  const params = useParams();
  const collectionName = CONTENT_COLLECTIONS.includes(params.collection as ContentCollection)
    ? (params.collection as ContentCollection)
    : "problems";

  return (
    <AdminShell active="content">
      <PageTitle
        title="Managed Learning Content"
        description="Use typed, versioned forms. Permanent deletion is restricted to dependency-free draft or rejected records."
      />
      <div className="mt-6 flex flex-wrap gap-2">
        {CONTENT_COLLECTIONS.map((item) => (
          <Link
            key={item}
            to={`/admin/content/${item}`}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${item === collectionName
              ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
              : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
          >
            {item.replace(/_/g, " ")}
          </Link>
        ))}
      </div>
      <div className="mt-6">
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Approved problem scoring material is copied into new sessions. Standalone formula, prompt, misconception, and difficulty records are maintained as a content library; editing them does not automatically change the current practice engine or historical sessions.</p>
        <ManagedContentEditor collectionName={collectionName} />
      </div>
    </AdminShell>
  );
}

export function SecureAdminReports() {
  const navigate = useNavigate();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [topic, setTopic] = useState("");
  const [total, setTotal] = useState<number | null>(null);
  const filters = {
    ...(from ? { from: Date.parse(`${from}T00:00:00+08:00`) } : {}),
    ...(to ? { to: Date.parse(`${to}T23:59:59.999+08:00`) } : {}),
    ...(topic ? { topic } : {}),
  };
  const [kind, setKind] = useState<ReportKind>("learning_progress");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [includeIdentity, setIncludeIdentity] = useState(false);
  const [reason, setReason] = useState("Authorized capstone evaluation report");
  const [error, setError] = useState<string | null>(null);

  const [reportBusy, setReportBusy] = useState(false);
  const reportPending = useRef(false);
  function clearReport() { setRows([]); setTotal(null); setError(null); }

  async function run() {
    if (reportPending.current) return;
    reportPending.current = true;
    setReportBusy(true);
    setError(null);
    try {
      if (from && to && from > to) throw new Error("The report start date must not follow its end date.");
      const combined: Record<string, unknown>[] = [];
      let cursor: string | undefined;
      do {
        const result = await adminQueryReport({ kind, ...filters, includeIdentity, limit: 250, ...(cursor ? { cursor } : {}) });
        combined.push(...result.rows);
        cursor = result.nextCursor ?? undefined;
      } while (cursor);
      setRows(combined);
      setTotal(combined.length);
    } catch (cause) {
      setRows([]);
      setTotal(null);
      setError(errorMessage(cause, "Report failed."));
    } finally { reportPending.current = false; setReportBusy(false); }
  }

  async function output(format: "csv" | "print") {
    if (reportPending.current) return;
    reportPending.current = true;
    setReportBusy(true);
    setError(null);
    try {
      const result = await adminExportReport({
        kind,
        ...filters,
        includeIdentity,
        exportReason: reason,
        limit: 1000,
        output: format,
      });
      if (result.output === "csv") {
        const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" }));
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = result.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      } else {
        navigate("/admin/reports/print", { state: { report: result } });
      }
    } catch (cause) {
      setError(errorMessage(cause, "Export failed."));
    } finally { reportPending.current = false; setReportBusy(false); }
  }

  return (
    <AdminShell active="reports">
      <PageTitle
        title="Reports and Exports"
        description="Reports are pseudonymized by default. CSV and print/PDF output are audited."
      />
      {error && <ErrorBox message={error} />}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="grid gap-3 md:grid-cols-4">
          <select disabled={reportBusy}
            value={kind}
            onChange={(event) => { clearReport(); setKind(event.target.value as ReportKind); }}
            className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="learning_progress">Learning progress</option>
            <option value="scorecards">Scorecards</option>
            <option value="misconceptions">Misconceptions</option>
            <option value="activity">Activity</option>
            <option value="usage">Usage</option>
          </select>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300">
            <input disabled={reportBusy}
              type="checkbox"
              checked={includeIdentity}
              onChange={(event) => { clearReport(); setIncludeIdentity(event.target.checked); }}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900"
            />
            Include identity
          </label>
          <input disabled={reportBusy}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Audit reason"
            className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <div className="flex gap-2">
            <button
              disabled={reportBusy}
              onClick={() => void run()}
              className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            >
              Preview
            </button>
            <button
              disabled={reportBusy}
              onClick={() => void output("csv")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Export CSV"
            >
              <Download className="h-5 w-5" />
            </button>
            <button
              disabled={reportBusy}
              onClick={() => void output("print")}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              aria-label="Open print report"
            >
              <Printer className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 pt-4 border-t border-slate-200 dark:border-slate-800 text-sm">
          <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
            From (Manila):
            <input disabled={reportBusy}
              type="date"
              value={from}
              onChange={(event) => { clearReport(); setFrom(event.target.value); }}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
            Through (Manila):
            <input disabled={reportBusy}
              type="date"
              value={to}
              onChange={(event) => { clearReport(); setTo(event.target.value); }}
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="flex items-center gap-2 font-medium text-slate-700 dark:text-slate-300">
            Exact topic:
            <input disabled={reportBusy}
              value={topic}
              onChange={(event) => { clearReport(); setTopic(event.target.value); }}
              placeholder="Filter by topic"
              className="rounded-lg border border-slate-200 bg-white p-1.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>
      </div>
      {total !== null && (
        <p className="mt-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
          Preview: showing {rows.length} of {total} rows. Exports include all matching records.
        </p>
      )}
      <JsonTable rows={rows} />
    </AdminShell>
  );
}

export function SecureAdminReportPrint() {
  const location = useLocation();
  const report = (location.state as { report?: ReportExportResponse } | null)?.report;
  if (!report || report.output !== "print") {
    return (
      <AdminShell active="reports">
        <ErrorBox message="This protected print view has no prepared report. Return to Reports and generate one." />
        <Link
          to="/admin/reports"
          className="mt-5 inline-flex rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700"
        >
          Return to reports
        </Link>
      </AdminShell>
    );
  }
  return (
    <AdminShell active="reports">
      <div className="print-report">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <Link
            to="/admin/reports"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            Back
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-indigo-700"
          >
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </button>
        </div>
        <header className="mt-8 border-b border-slate-200 pb-5 dark:border-slate-800">
          <h1 className="text-3xl font-bold text-slate-950 dark:text-white">
            MINDGUIDE {report.kind.replace(/_/g, " ")} report
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Generated {new Date(report.generatedAt).toLocaleString()} · {report.pseudonymized ? "Pseudonymized" : "Identity included"}
          </p>
        </header>
        <JsonTable rows={report.rows} />
      </div>
    </AdminShell>
  );
}

export function SecureAdminNotifications() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("Authorized capstone announcement");
  const [result, setResult] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const publishing = useRef(false);

  async function publish() {
    if (publishing.current) return;
    publishing.current = true;
    setBusy(true);
    try {
      const response = await adminPublishAnnouncement({ title, message, reason });
      if (response.complete === false) {
        setResult(`Delivery interrupted: ${response.delivered} of ${response.total} recipients confirmed. Retry without changing the message to resume. ${response.error ?? ""}`);
        return;
      }
      setResult(`Announcement delivered to ${response.delivered} active students.`);
      setTitle("");
      setMessage("");
    } catch (cause) {
      setResult(errorMessage(cause, "Announcement failed. Retry the same message to resume any confirmed delivery."));
    } finally {
      publishing.current = false;
      setBusy(false);
    }
  }

  return (
    <AdminShell active="notifications">
      <PageTitle
        title="Administrator Notifications"
        description="Review live system updates and publish audited announcements to all active students."
      />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <h2 className="font-bold text-slate-950 dark:text-white">Publish announcement</h2>
        <div className="mt-4 grid gap-3">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={120}
            placeholder="Announcement title"
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={2000}
            rows={4}
            placeholder="Message for active students"
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required audit reason"
            className="rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
          <button
            disabled={busy || !title.trim() || !message.trim() || reason.trim().length < 8}
            onClick={() => void publish()}
            className="w-fit rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
          >
            Publish to active students
          </button>
        </div>
        {result && <Message text={result} />}
      </div>
      <div className="mt-8">
        <NotificationContent />
      </div>
    </AdminShell>
  );
}

export function SecureAdminProfile() {
  return (
    <AdminShell active="profile">
      <ProfileContent />
    </AdminShell>
  );
}

export function SecureAdminProgress() {
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db) return;
    Promise.all([
      getDocs(query(collection(db, "users"), where("role", "==", "student"))),
      getDocs(collection(db, "learning_progress")),
    ])
      .then(([usersSnapshot, progressSnapshot]) => {
        const progress = new Map(progressSnapshot.docs.map((item) => [item.id, item.data() as LearningProgress]));
        setRows(
          usersSnapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
            progress: progress.get(item.id),
          }))
        );
      })
      .catch((cause) => setError(errorMessage(cause, "Learner progress could not be loaded.")))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => rows.filter((row) => searchableUser(row).includes(search.toLowerCase())),
    [rows, search]
  );

  return (
    <AdminShell active="progress">
      <PageTitle
        title="Learner Progress Analytics"
        description="Search consolidated learner totals, latest activity, score averages, and current streaks."
      />
      {error && <ErrorBox message={error} />}
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search learner or academic profile"
        className="mt-6 w-full rounded-xl border border-slate-200 bg-white p-3 text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
      />
      {loading ? (
        <Spinner />
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-bold uppercase tracking-wider text-slate-600 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                <tr>
                  <th className="p-4">Learner</th>
                  <th className="p-4">Completed</th>
                  <th className="p-4">Average</th>
                  <th className="p-4">Streak</th>
                  <th className="p-4">Latest activity</th>
                  <th className="p-4">Latest score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-4">
                      <Link
                        className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
                        to={`/admin/progress/${row.id}`}
                      >
                        {row.displayName}
                      </Link>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{row.email}</p>
                    </td>
                    <td className="p-4 font-semibold text-slate-900 dark:text-slate-100">
                      {row.progress?.sessionsCompleted ?? 0}
                    </td>
                    <td className="p-4 font-semibold text-indigo-600 dark:text-indigo-400">
                      {row.progress?.averageCTScore ?? 0}/100
                    </td>
                    <td className="p-4 text-slate-700 dark:text-slate-300">
                      {row.progress?.currentStreak ?? 0} days
                    </td>
                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatTimestamp(row.progress?.lastActivityAt)}
                    </td>
                    <td className="p-4 font-bold text-slate-900 dark:text-slate-100">
                      {row.progress?.latestScorecard?.total ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

export function SecureAdminProgressDetail() {
  const { userId } = useParams();
  const [profile, setProfile] = useState<Record<string, any> | null>(null);
  const [progress, setProgress] = useState<LearningProgress | null>(null);
  const [sessions, setSessions] = useState<Record<string, any>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!db || !userId) return;
    Promise.all([
      getDoc(doc(db, "users", userId)),
      getDoc(doc(db, "learning_progress", userId)),
      getDocs(query(collection(db, "sessions"), where("studentId", "==", userId), orderBy("updatedAt", "desc"))),
    ])
      .then(([profileSnapshot, progressSnapshot, sessionsSnapshot]) => {
        setProfile(profileSnapshot.exists() ? profileSnapshot.data() : null);
        setProgress(progressSnapshot.exists() ? (progressSnapshot.data() as LearningProgress) : null);
        setSessions(sessionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      })
      .catch((cause) => setError(errorMessage(cause, "Learner progress detail could not be loaded.")))
      .finally(() => setLoading(false));
  }, [userId]);

  if (!userId) return <Navigate to="/admin/progress" replace />;
  if (loading) {
    return (
      <AdminShell active="progress">
        <Spinner />
      </AdminShell>
    );
  }
  if (error) {
    return (
      <AdminShell active="progress">
        <ErrorBox message={error} />
      </AdminShell>
    );
  }
  if (!profile) {
    return (
      <AdminShell active="progress">
        <ErrorBox message="Learner profile not found." />
      </AdminShell>
    );
  }

  return (
    <AdminShell active="progress">
      <Link
        to="/admin/progress"
        className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
      >
        ← Learner progress
      </Link>
      <div className="mt-3">
        <PageTitle
          title={profile.displayName ?? "Learner"}
          description={`${progress?.sessionsCompleted ?? 0
            } completed · ${progress?.averageCTScore ?? 0}/100 average`}
        />
      </div>

      {progress?.latestScorecard && (
        <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 dark:border-indigo-900/50 dark:bg-indigo-950/30">
          <p className="text-xs font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            Latest scorecard: {progress.latestScorecard.total}/100
          </p>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{progress.latestScorecard.summary}</p>
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="border-b border-slate-200 p-4 font-bold text-slate-950 dark:border-slate-800 dark:text-white">
          Sessions
        </div>
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to={`/admin/review/${session.id}`}
              className="grid gap-2 p-4 transition hover:bg-slate-50 dark:hover:bg-slate-800/60 md:grid-cols-[1fr_1.5fr_auto_auto] md:items-center"
            >
              <span className="font-semibold text-slate-900 dark:text-slate-100">{session.subject}</span>
              <span className="text-sm text-slate-600 dark:text-slate-400">{session.topic}</span>
              <span className="font-bold text-indigo-600 dark:text-indigo-400">
                {session.scorecard?.total ?? "—"}
              </span>
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusBadgeClass(session.status)}`}>
                {session.status}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}

export function SecureAdminLogs() {
  const [audits, setAudits] = useState<Record<string, any>[]>([]);
  const [failures, setFailures] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [more, setMore] = useState(false);
  const cursors = useRef<Array<QueryDocumentSnapshot<DocumentData> | undefined>>([]);
  const exhausted = useRef([false, false]);
  const loading = useRef(false);
  async function load(reset = false) {
    if (!db || loading.current) return;
    loading.current = true;
    setBusy(true);
    setError(null);
    try {
      const pages = await Promise.all(["audit_logs", "ai_failure_logs"].map((name, index) => {
        if (!reset && exhausted.current[index]) return null;
        const cursor = reset ? undefined : cursors.current[index];
        return getDocs(query(collection(db!, name), orderBy("createdAt", "desc"), ...(cursor ? [startAfter(cursor)] : []), limit(100)));
      }));
      pages.forEach((page, index) => {
        if (!page) return;
        cursors.current[index] = page.docs.at(-1);
        exhausted.current[index] = page.docs.length < 100;
        const rows = page.docs.map(item => ({ id: item.id, ...item.data() }));
        (index === 0 ? setAudits : setFailures)(previous => reset ? rows : [...previous, ...rows]);
      });
      setMore(exhausted.current.some(value => !value));
    } catch (cause) { setError(errorMessage(cause, "Administrator logs could not be loaded.")); }
    finally { setBusy(false); loading.current = false; }
  }
  // Load one initial page; subsequent pages are user requested.
  useEffect(() => { void load(true); }, []);
  return <AdminShell active="logs">
    <PageTitle title="Activity and Legacy AI Logs" description="Review application administrative events and existing AI failure records. The current practice engine does not call a live AI service. These logs do not cover external Firebase Console actions." />
    {error && <ErrorBox message={error} />}
    {busy && <p role="status">Loading logs…</p>}
    <div className="mt-6 grid gap-6 xl:grid-cols-2">
      <LogPanel title="Audit events" icon={<ClipboardList className="h-5 w-5" />} rows={audits} />
      <LogPanel title="Legacy AI failures" icon={<FileWarning className="h-5 w-5" />} rows={failures} />
    </div>
    <button disabled={busy} onClick={() => void load(true)} className="mt-4 rounded-xl border p-3">Refresh logs</button>
    {more && <button disabled={busy} onClick={() => void load()} className="ml-3 rounded-xl border p-3">Load older logs</button>}
  </AdminShell>;
}

export function SecureAdminSettings() {
  return <AdminShell active="settings"><PageTitle title="System and Privacy Settings" description="Configure consent and session inactivity. Retention and study closure are recorded policies, not scheduled cleanup or access controls." /><AdminPrivacySettings /></AdminShell>;
}

export function SecureAdminMaintenance() {
  return (
    <AdminShell active="maintenance">
      <PageTitle
        title="Maintenance and Cohort Records"
        description="Maintain cohort records and review operator tasks. Active accounts and approved content determine learning access."
      />
      <div className="mt-6">
        <PilotControls />
        <section className="mt-6 rounded-xl border p-5 space-y-3">
          <h2 className="font-bold">Operator maintenance</h2>
          <p>Account deletion, backup and restore, security configuration, and retention cleanup require an authorized project operator. This page does not perform or verify those tasks.</p>
          <a className="block underline" target="_blank" rel="noreferrer" href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/authentication/users`}>Open Authentication users</a>
          <a className="block underline" target="_blank" rel="noreferrer" href={`https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/firestore`}>Open Firestore data and rules</a>
          <p>Review dependencies and the recorded retention policy before cleanup. Restore only verified backups of this project; no demo data or replacement approvals.</p>
        </section>
      </div>
    </AdminShell>
  );
}

export function SecureAdminReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Record<string, any> | null>(null);
  const [responses, setResponses] = useState<Record<string, any>[]>([]);
  const [comment, setComment] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!db || !sessionId) return;
    Promise.all([
      getDoc(doc(db, "sessions", sessionId)),
      getDocs(query(collection(db, "sessions", sessionId, "responses"), orderBy("createdAt", "asc"))),
    ])
      .then(([snapshot, responseSnapshot]) => {
        setSession(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
        setResponses(responseSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      })
      .catch((cause) => setError(errorMessage(cause, "Session review could not be loaded.")))
      .finally(() => setLoading(false));
  }, [sessionId]);

  async function review(outcome: "reviewed" | "returned") {
    if (!sessionId) return;
    try {
      await adminReviewSession({ sessionId, outcome, comment });
      navigate("/admin/dashboard");
    } catch (cause) {
      setError(errorMessage(cause, "Review failed."));
    }
  }

  async function overrideSupport(level: "worked_explanation" | "full_solution") {
    if (!sessionId) return;
    try {
      await adminOverrideSessionSupport({ sessionId, level, reason: overrideReason });
      setError(`Audited ${level.replace(/_/g, " ")} exception authorized. The learner must reload the session.`);
    } catch (cause) {
      setError(errorMessage(cause, "Support override failed."));
    }
  }

  if (!sessionId) return <Navigate to="/admin/dashboard" />;
  if (loading) {
    return (
      <AdminShell active="dashboard">
        <Spinner />
      </AdminShell>
    );
  }
  if (!session) {
    return (
      <AdminShell active="dashboard">
        <ErrorBox message={error ?? "The learner session was not found."} />
      </AdminShell>
    );
  }

  const canOverride = Boolean(session.scorecard && session.releasedSolution);

  return (
    <AdminShell active="dashboard">
      {error && <ErrorBox message={error} />}
      <PageTitle
        title={`Review: ${session.studentName ?? "Learner"}`}
        description={`${session.subject} · ${session.topic} · ${session.status}`}
      />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <h2 className="font-bold text-slate-950 dark:text-white">Problem</h2>
        <p className="mt-2 text-slate-700 dark:text-slate-300">{session.originalQuestion}</p>
        {session.scorecard && <ScorecardDetails scorecard={session.scorecard} />}
      </div>
      <div className="mt-6 space-y-3">
        {responses.map((response) => (
          <div
            key={response.id}
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900/80"
          >
            <p className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              {String(response.phase).replace(/_/g, " ")}
            </p>
            <p className="mt-2 text-slate-800 dark:text-slate-200">{response.response?.plainText}</p>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{response.evaluation?.evidenceSummary}</p>
          </div>
        ))}
      </div>
      {session.releasedSolution && <SolutionDetails solution={session.releasedSolution} />}
      {canOverride && (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-900/50 dark:bg-amber-950/30">
          <h2 className="font-bold text-amber-950 dark:text-amber-200">Audited post-score solution authorization</h2>
          <textarea
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            rows={3}
            placeholder="Required exception reason"
            className="mt-3 w-full rounded-xl border border-amber-300 bg-white p-3 text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-amber-800 dark:bg-slate-900 dark:text-slate-100"
          />
          <div className="mt-3 flex gap-2">
            <button
              disabled={overrideReason.trim().length < 8}
              onClick={() => void overrideSupport("worked_explanation")}
              className="rounded-xl border border-amber-500 bg-white px-4 py-2 font-bold text-amber-800 shadow-sm transition hover:bg-amber-100 disabled:opacity-50 dark:bg-slate-900 dark:text-amber-300"
            >
              Authorize worked explanation
            </button>
            <button
              disabled={overrideReason.trim().length < 8}
              onClick={() => void overrideSupport("full_solution")}
              className="rounded-xl bg-amber-700 px-4 py-2 font-bold text-white shadow-sm transition hover:bg-amber-800 disabled:opacity-50"
            >
              Authorize full solution
            </button>
          </div>
        </div>
      )}
      {session.status === "submitted" && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
          <label className="block text-sm font-bold text-slate-950 dark:text-white">
            Administrator formative comment
            <textarea
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              rows={5}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white p-3 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <div className="mt-4 flex gap-3">
            <button
              disabled={!comment.trim()}
              onClick={() => void review("returned")}
              className="rounded-xl border border-amber-400 bg-white px-4 py-2.5 font-bold text-amber-800 shadow-sm transition hover:bg-amber-50 disabled:opacity-50 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
            >
              Return for follow-up
            </button>
            <button
              disabled={!comment.trim()}
              onClick={() => void review("reviewed")}
              className="rounded-xl bg-indigo-600 px-4 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
            >
              Mark reviewed
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function searchableUser(user: Record<string, any>): string {
  return `${user.displayName} ${user.email} ${user.role} ${user.status}`.toLowerCase();
}

function PageTitle({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">{title}</h1>
      <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-400">{description}</p>
    </div>
  );
}

function AdminStat({
  label,
  value,
  Icon,
  iconClassName,
}: {
  label: string;
  value: ReactNode;
  Icon: LucideIcon;
  iconClassName: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconClassName}`}>
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

/**
 * Renders an administrator platform statistic card.
 *
 * @param props - Card properties containing label and numeric value.
 * @param props.label - Descriptive label of the statistic.
 * @param props.value - Numeric count or quantity.
 * @returns Rendered metric card with icon badge.
 */
export function Stat({ label, value }: { label: string; value: number }) {
  const Icon = label.toLowerCase().includes("user")
    ? Users
    : label.toLowerCase().includes("session")
      ? BrainCircuit
      : label.toLowerCase().includes("problem")
        ? BookOpen
        : label.toLowerCase().includes("audit")
          ? Activity
          : AlertCircle;
  return (
    <AdminStat
      label={label}
      value={value}
      Icon={Icon}
      iconClassName="bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400"
    />
  );
}

function statusBadgeClass(status?: string) {
  switch (status) {
    case "completed":
    case "reviewed":
    case "approved":
    case "active":
      return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30";
    case "submitted":
    case "pending_validation":
    case "suspended":
      return "bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30";
    case "deactivated":
    case "rejected":
      return "bg-rose-50 text-rose-700 ring-1 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30";
    default:
      return "bg-slate-100 text-slate-700 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700";
  }
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="mb-6 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
      <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
      <span>{message}</span>
    </div>
  );
}

function Message({ text }: { text: string }) {
  return (
    <div className="mt-4 break-all rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200">
      {text}
    </div>
  );
}

function Spinner() {
  return (
    <div role="status" aria-label="Loading administrator data" className="flex justify-center p-12">
      <Loader2 className="h-7 w-7 animate-spin text-indigo-600 dark:text-indigo-400" />
    </div>
  );
}

function Action({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold capitalize text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
    >
      {children}
    </button>
  );
}

function JsonTable({ rows }: { rows: Record<string, unknown>[] }) {
  if (!rows.length) {
    return (
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400">
        Generate a report to view results.
      </div>
    );
  }
  const headers = Object.keys(rows[0]);
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
            <tr>
              {headers.map((header) => (
                <th key={header} className="p-3.5 font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {rows.map((row, index) => (
              <tr key={index} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                {headers.map((header) => (
                  <td key={header} className="max-w-xs truncate p-3.5 text-slate-800 dark:text-slate-200">
                    {String(row[header] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LogPanel({ title, icon, rows }: { title: string; icon: ReactNode; rows: Record<string, any>[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <h2 className="flex items-center gap-2 text-base font-bold text-slate-950 dark:text-white">
        <span className="text-indigo-600 dark:text-indigo-400">{icon}</span>
        {title}
      </h2>
      <div className="mt-4 max-h-[40rem] divide-y divide-slate-200 overflow-auto dark:divide-slate-800">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">No log entries found.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="py-3 text-xs">
              <p className="font-bold text-slate-900 dark:text-slate-100">{row.action ?? row.operation ?? row.reason ?? "event"}</p>
              <p className="mt-1 break-all text-slate-500 dark:text-slate-400">{row.target ?? row.sessionId ?? row.correlationId ?? row.id}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SolutionDetails({ solution }: { solution: Record<string, any> }) {
  return (
    <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
      <p className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
        Released solution
      </p>
      <p className="mt-2 text-sm">
        <strong>Method:</strong> {solution.method}
      </p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {(solution.steps ?? []).map((step: string) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="mt-3 text-sm">
        <strong>Answer:</strong> {solution.answer}
      </p>
    </div>
  );
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function formatTimestamp(value: any): string {
  if (!value) return "—";
  if (typeof value === "number") return new Date(value).toLocaleString();
  if (typeof value.toDate === "function") return value.toDate().toLocaleString();
  return "—";
}
