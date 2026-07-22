import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from "firebase/firestore";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import {
  Activity,
  AlertCircle,
  Archive,
  BarChart3,
  BookOpen,
  ClipboardList,
  Database,
  Download,
  FileWarning,
  LayoutDashboard,
  Loader2,
  LogOut,
  Save,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { db } from "@/lib/firebase";
import type { ReportKind } from "@mindguide/contracts";
import {
  adminArchiveContent,
  adminExportReport,
  adminManageUser,
  adminOverrideSessionSupport,
  adminQueryReport,
  adminReviewSession,
  adminUpsertContent,
} from "@/lib/secure-api";
import { useAuthStore } from "@/stores/auth-store";

const CONTENT_COLLECTIONS = [
  "subjects",
  "topics",
  "problems",
  "formula_theorem_references",
  "socratic_prompt_bank",
  "misconception_categories",
  "difficulty_policies",
] as const;

type ContentCollection = (typeof CONTENT_COLLECTIONS)[number];

function AdminShell({ active, children }: { active: string; children: ReactNode }) {
  const signOut = useAuthStore((state) => state.signOut);
  const navigate = useNavigate();
  const nav = [
    ["dashboard", "/admin/dashboard", "Dashboard", LayoutDashboard],
    ["users", "/admin/users", "Users", Users],
    ["content", "/admin/content/problems", "Content", BookOpen],
    ["reports", "/admin/reports", "Reports", BarChart3],
    ["logs", "/admin/logs", "Audit & AI", Activity],
    ["settings", "/admin/settings", "Settings", Settings],
    ["maintenance", "/admin/maintenance", "Maintenance", Database],
  ] as const;
  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-950 p-5 text-white md:block">
        <div className="flex items-center gap-2 text-xl font-bold"><ShieldCheck className="h-7 w-7 text-emerald-400" />MINDGUIDE Admin</div>
        <nav className="mt-8 space-y-1">{nav.map(([id, href, label, Icon]) => <Link key={id} to={href} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold ${active === id ? "bg-emerald-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}><Icon className="h-4 w-4" />{label}</Link>)}</nav>
        <button onClick={() => void signOut().then(() => navigate("/login"))} className="mt-10 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-300 hover:bg-slate-800"><LogOut className="h-4 w-4" />Sign out</button>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}

export function SecureAdminDashboard() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sessions, setSessions] = useState<Record<string, any>[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!db) return;
    Promise.all([
      getDocs(collection(db, "users")),
      getDocs(query(collection(db, "sessions"), orderBy("updatedAt", "desc"), limit(50))),
      getDocs(collection(db, "problems")),
      getDocs(collection(db, "audit_logs")),
    ]).then(([usersSnapshot, sessionsSnapshot, problemSnapshot, auditSnapshot]) => {
      const values: Record<string, any>[] = sessionsSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      setSessions(values);
      setCounts({ users: usersSnapshot.size, sessions: sessionsSnapshot.size, problems: problemSnapshot.size, audits: auditSnapshot.size, pending: values.filter((item) => item.status === "submitted").length });
    }).catch((cause) => setError(cause instanceof Error ? cause.message : "Administrator data could not be loaded."));
  }, []);
  return <AdminShell active="dashboard"><PageTitle title="System Administrator Dashboard" description="Monitor authoritative learner records, managed content, reports, and security activity." />{error && <ErrorBox message={error} />}<div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{Object.entries(counts).map(([label, value]) => <Stat key={label} label={label} value={value} />)}</div><div className="mt-8 overflow-hidden rounded-2xl border bg-white"><div className="border-b p-4 font-bold">Recent learner sessions</div><div className="divide-y">{sessions.slice(0, 20).map((session) => <Link key={session.id} to={`/admin/review/${session.id}`} className="grid gap-2 p-4 hover:bg-slate-50 md:grid-cols-[1fr_1.5fr_auto_auto]"><span className="font-semibold">{session.studentName ?? "Learner"}</span><span className="text-slate-600">{session.subject} · {session.topic}</span><span className="font-semibold text-indigo-600">{session.scorecard?.total ?? session.ctScore ?? "—"}</span><span className="text-sm capitalize text-slate-500">{session.status}</span></Link>)}</div></div></AdminShell>;
}

export function SecureAdminUsers() {
  const [usersList, setUsersList] = useState<Record<string, any>[]>([]);
  const [search, setSearch] = useState("");
  const [reason, setReason] = useState("Authorized capstone account administration");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  async function load() { if (!db) return; setLoading(true); const snapshot = await getDocs(collection(db, "users")); setUsersList(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); setLoading(false); }
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, []);
  const filtered = useMemo(() => usersList.filter((user) => `${user.displayName} ${user.email} ${user.role} ${user.status}`.toLowerCase().includes(search.toLowerCase())), [search, usersList]);
  async function act(userId: string, action: "promote" | "demote" | "suspend" | "activate" | "deactivate" | "anonymize" | "reset_access") {
    setMessage(null); try { const result = await adminManageUser({ userId, action, reason }); setMessage(action === "reset_access" ? `Reset link: ${String(result.resetLink)}` : `Account action '${action}' completed. The user must refresh their token.`); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "User action failed."); }
  }
  return <AdminShell active="users"><PageTitle title="User Account Management" description="Search, promote, suspend, reactivate, deactivate, anonymize, or issue access-reset links. The final active administrator is protected." /><div className="mt-6 grid gap-3 md:grid-cols-2"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users" className="rounded-xl border bg-white p-3" /><input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required audit reason" className="rounded-xl border bg-white p-3" /></div>{message && <div className="mt-4 break-all rounded-xl bg-indigo-50 p-4 text-sm font-semibold text-indigo-800">{message}</div>}{loading ? <Spinner /> : <div className="mt-6 overflow-x-auto rounded-2xl border bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="p-3">Account</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((user) => <tr key={user.id} className="border-t"><td className="p-3"><p className="font-bold">{user.displayName}</p><p className="text-xs text-slate-500">{user.email}</p></td><td>{user.role}</td><td>{user.status ?? "active"}</td><td className="flex flex-wrap gap-1 py-3">{(user.role === "admin" ? ["demote"] : ["promote"]).map((action) => <Action key={action} onClick={() => void act(user.id, action as "promote" | "demote")}>{action}</Action>)}<Action onClick={() => void act(user.id, user.status === "suspended" ? "activate" : "suspend")}>{user.status === "suspended" ? "activate" : "suspend"}</Action>{user.status !== "deactivated" && user.status !== "anonymized" && <Action onClick={() => void act(user.id, "deactivate")}>deactivate</Action>}{user.role !== "admin" && user.status === "deactivated" && <Action onClick={() => void act(user.id, "anonymize")}>anonymize</Action>}<Action onClick={() => void act(user.id, "reset_access")}>reset</Action></td></tr>)}</tbody></table></div>}</AdminShell>;
}

export function SecureAdminContent() {
  const params = useParams();
  const collectionName = CONTENT_COLLECTIONS.includes(params.collection as ContentCollection) ? params.collection as ContentCollection : "problems";
  const [items, setItems] = useState<Record<string, any>[]>([]);
  const [recordId, setRecordId] = useState("");
  const [json, setJson] = useState('{\n  "status": "draft"\n}');
  const [message, setMessage] = useState<string | null>(null);
  const load = useCallback(async () => { if (!db) return; const snapshot = await getDocs(collection(db, collectionName)); setItems(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); }, [collectionName]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  async function save() { try { const value = JSON.parse(json); await adminUpsertContent({ collection: collectionName, id: recordId, value }); setMessage("Versioned content saved and audited."); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Content could not be saved."); } }
  async function archive(id: string) { try { await adminArchiveContent({ collection: collectionName, id }); await load(); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Content could not be archived."); } }
  return <AdminShell active="content"><PageTitle title="Managed Learning Content" description="Create, version, approve, and archive content. Problem private solutions are stored in protected subdocuments." /><div className="mt-5 flex flex-wrap gap-2">{CONTENT_COLLECTIONS.map((item) => <Link key={item} to={`/admin/content/${item}`} className={`rounded-lg px-3 py-2 text-xs font-bold ${item === collectionName ? "bg-emerald-600 text-white" : "border bg-white"}`}>{item.replace(/_/g, " ")}</Link>)}</div>{message && <div className="mt-4 rounded-xl bg-indigo-50 p-3 text-sm font-semibold text-indigo-800">{message}</div>}<div className="mt-6 grid gap-6 xl:grid-cols-2"><div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Create or update</h2><input value={recordId} onChange={(event) => setRecordId(event.target.value)} placeholder="stable-record-id" className="mt-3 w-full rounded-lg border p-3" /><textarea value={json} onChange={(event) => setJson(event.target.value)} rows={16} className="mt-3 w-full rounded-lg border p-3 font-mono text-xs" /><button disabled={!recordId} onClick={() => void save()} className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />Save version</button></div><div className="rounded-2xl border bg-white p-5"><h2 className="font-bold">Existing records ({items.length})</h2><div className="mt-3 max-h-[38rem] divide-y overflow-auto">{items.map((item) => <div key={item.id} className="flex items-start justify-between gap-3 py-3"><button className="min-w-0 text-left" onClick={() => { setRecordId(item.id); const copy = { ...item }; delete copy.id; setJson(JSON.stringify(copy, null, 2)); }}><p className="truncate font-semibold">{item.name ?? item.problemText ?? item.id}</p><p className="text-xs text-slate-500">{item.id} · v{item.version ?? 0} · {item.status}</p></button><button onClick={() => void archive(item.id)} className="rounded-lg border p-2 text-slate-500" aria-label={`Archive ${item.id}`}><Archive className="h-4 w-4" /></button></div>)}</div></div></div></AdminShell>;
}

export function SecureAdminReports() {
  const [kind, setKind] = useState("learning_progress");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [includeIdentity, setIncludeIdentity] = useState(false);
  const [reason, setReason] = useState("Authorized capstone evaluation report");
  const [error, setError] = useState<string | null>(null);
  async function run() { try { const result = await adminQueryReport({ kind: kind as ReportKind, includeIdentity, limit: 250 }); setRows(result.rows); } catch (cause) { setError(cause instanceof Error ? cause.message : "Report failed."); } }
  async function download() { try { const result = await adminExportReport({ kind: kind as ReportKind, includeIdentity, exportReason: reason, limit: 1000 }); const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename; anchor.click(); URL.revokeObjectURL(url); } catch (cause) { setError(cause instanceof Error ? cause.message : "Export failed."); } }
  return <AdminShell active="reports"><PageTitle title="Reports and Exports" description="Reports are pseudonymized by default. Every export requires a reason and creates an audit event." />{error && <ErrorBox message={error} />}<div className="mt-6 grid gap-3 rounded-2xl border bg-white p-5 md:grid-cols-4"><select value={kind} onChange={(event) => setKind(event.target.value)} className="rounded-lg border p-3"><option value="learning_progress">Learning progress</option><option value="scorecards">Scorecards</option><option value="misconceptions">Misconceptions</option><option value="activity">Activity</option><option value="usage">Usage</option></select><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={includeIdentity} onChange={(event) => setIncludeIdentity(event.target.checked)} />Include identity</label><input value={reason} onChange={(event) => setReason(event.target.value)} className="rounded-lg border p-3 text-sm" /><div className="flex gap-2"><button onClick={() => void run()} className="rounded-lg bg-indigo-600 px-4 py-2 font-bold text-white">Generate</button><button onClick={() => void download()} className="rounded-lg border px-4 py-2" aria-label="Export CSV"><Download className="h-5 w-5" /></button></div></div><JsonTable rows={rows} /></AdminShell>;
}

export function SecureAdminLogs() {
  const [audits, setAudits] = useState<Record<string, any>[]>([]);
  const [failures, setFailures] = useState<Record<string, any>[]>([]);
  useEffect(() => { if (!db) return; Promise.all([getDocs(query(collection(db, "audit_logs"), orderBy("createdAt", "desc"), limit(100))), getDocs(query(collection(db, "ai_failure_logs"), orderBy("createdAt", "desc"), limit(100)))]).then(([a, f]) => { setAudits(a.docs.map((item) => ({ id: item.id, ...item.data() }))); setFailures(f.docs.map((item) => ({ id: item.id, ...item.data() }))); }); }, []);
  return <AdminShell active="logs"><PageTitle title="Activity, Security, and AI Failure Logs" description="Review immutable administrative changes, report exports, AI fallbacks, unsupported inputs, and security events." /><div className="mt-6 grid gap-6 xl:grid-cols-2"><LogPanel title="Audit events" icon={<ClipboardList className="h-5 w-5" />} rows={audits} /><LogPanel title="AI failures" icon={<FileWarning className="h-5 w-5" />} rows={failures} /></div></AdminShell>;
}

export function SecureAdminSettings({ maintenance = false }: { maintenance?: boolean }) {
  const active = maintenance ? "maintenance" : "settings";
  const settingId = maintenance ? "maintenance" : "privacy";
  const [json, setJson] = useState("{}");
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { if (!db) return; getDoc(doc(db, "system_settings", settingId)).then((snapshot) => setJson(JSON.stringify(snapshot.exists() ? snapshot.data() : {}, null, 2))); }, [settingId]);
  async function save() { try { await adminUpsertContent({ collection: "system_settings", id: settingId, value: JSON.parse(json) }); setMessage("Settings saved and audited."); } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Settings failed."); } }
  return <AdminShell active={active}><PageTitle title={maintenance ? "Maintenance and Release Controls" : "System and Privacy Settings"} description={maintenance ? "Control maintenance mode, migration readiness, study closure, backups, and release prerequisites." : "Configure consent version, study closure, retention, and server-controlled policy values."} />{maintenance && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Firebase billing, App Check registration/enforcement, Secret Manager, IAM, staging deployment, managed export, and production credential rotation require project-owner access and must be completed before evaluation.</div>}<textarea value={json} onChange={(event) => setJson(event.target.value)} rows={20} className="mt-6 w-full rounded-xl border bg-slate-950 p-4 font-mono text-sm text-slate-100" />{message && <p className="mt-3 text-sm font-semibold text-indigo-700">{message}</p>}<button onClick={() => void save()} className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white"><Save className="h-4 w-4" />Save audited settings</button></AdminShell>;
}

export function SecureAdminMaintenance() {
  return <SecureAdminSettings maintenance />;
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
  useEffect(() => { if (!db || !sessionId) return; Promise.all([getDoc(doc(db, "sessions", sessionId)), getDocs(query(collection(db, "sessions", sessionId, "responses"), orderBy("createdAt", "asc")))]).then(([snapshot, responseSnapshot]) => { setSession(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null); setResponses(responseSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))); }).catch((cause) => setError(cause instanceof Error ? cause.message : "Session review could not be loaded.")).finally(() => setLoading(false)); }, [sessionId]);
  async function review(outcome: "reviewed" | "returned") { if (!sessionId) return; try { await adminReviewSession({ sessionId, outcome, comment }); navigate("/admin/dashboard"); } catch (cause) { setError(cause instanceof Error ? cause.message : "Review failed."); } }
  async function overrideSupport(level: "worked_explanation" | "full_solution") { if (!sessionId) return; try { await adminOverrideSessionSupport({ sessionId, level, reason: overrideReason }); setError(`Audited ${level.replace(/_/g, " ")} exception authorized. The learner must reload the session.`); } catch (cause) { setError(cause instanceof Error ? cause.message : "Support override failed."); } }
  if (!sessionId) return <Navigate to="/admin/dashboard" />;
  if (loading) return <AdminShell active="dashboard"><Spinner /></AdminShell>;
  if (!session) return <AdminShell active="dashboard"><ErrorBox message={error ?? "The learner session was not found."} /><Link to="/admin/dashboard" className="mt-5 inline-flex rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white">Return to dashboard</Link></AdminShell>;
  const canOverride = Boolean(session.scorecard && session.releasedSolution);
  return <AdminShell active="dashboard">{error && <ErrorBox message={error} />}{!session ? <Spinner /> : <><PageTitle title={`Review: ${session.studentName ?? "Learner"}`} description={`${session.subject} · ${session.topic} · ${session.status}`} /><div className="mt-6 rounded-2xl border bg-white p-5"><h2 className="font-bold">Problem</h2><p className="mt-2 text-slate-700">{session.originalQuestion}</p>{session.scorecard && <AdminScorecardDetails scorecard={session.scorecard} />}</div><div className="mt-6 space-y-3">{responses.map((response) => <div key={response.id} className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-indigo-600">{String(response.phase).replace(/_/g, " ")}</p><p className="mt-2">{response.response?.plainText}</p>{response.response?.latex && <code className="mt-2 block rounded bg-slate-50 p-2">{response.response.latex}</code>}<p className="mt-2 text-sm text-slate-600">{response.evaluation?.evidenceSummary}</p></div>)}</div>{session.releasedSolution && <AdminSolutionDetails solution={session.releasedSolution} />}{canOverride && <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5"><h2 className="font-bold text-amber-950">Audited post-score solution authorization</h2><p className="mt-1 text-sm text-amber-900">The learner's score and ordinary solution release are already fixed. Use this only to record an exceptional additional-support authorization.</p><textarea value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} rows={3} placeholder="Required exception reason" className="mt-3 w-full rounded-xl border border-amber-300 p-3" /><div className="mt-3 flex flex-wrap gap-2"><button disabled={overrideReason.trim().length < 8} onClick={() => void overrideSupport("worked_explanation")} className="rounded-lg border border-amber-500 px-3 py-2 font-bold text-amber-900 disabled:opacity-50">Authorize worked explanation</button><button disabled={overrideReason.trim().length < 8} onClick={() => void overrideSupport("full_solution")} className="rounded-lg bg-amber-700 px-3 py-2 font-bold text-white disabled:opacity-50">Authorize full solution</button></div></div>}{session.status === "submitted" && <div className="mt-6 rounded-2xl border bg-white p-5"><label className="text-sm font-bold">Administrator formative comment<textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border p-3 font-normal" /></label><div className="mt-4 flex gap-3"><button disabled={!comment.trim()} onClick={() => void review("returned")} className="rounded-lg border border-amber-400 px-4 py-2 font-bold text-amber-700 disabled:opacity-50">Return for follow-up</button><button disabled={!comment.trim()} onClick={() => void review("reviewed")} className="rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white disabled:opacity-50">Mark reviewed</button></div></div>}</>}</AdminShell>;
}

function PageTitle({ title, description }: { title: string; description: string }) { return <div><h1 className="text-3xl font-bold text-slate-950">{title}</h1><p className="mt-2 text-slate-600">{description}</p></div>; }
function Stat({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl border bg-white p-5"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-3xl font-bold text-slate-950">{value}</p></div>; }
function ErrorBox({ message }: { message: string }) { return <div className="mt-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700"><AlertCircle className="h-5 w-5" />{message}</div>; }
function Spinner() { return <div className="flex justify-center p-12"><Loader2 className="h-7 w-7 animate-spin text-emerald-600" /></div>; }
function Action({ onClick, children }: { onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className="rounded border px-2 py-1 text-xs font-bold capitalize hover:bg-slate-50">{children}</button>; }
function JsonTable({ rows }: { rows: Record<string, unknown>[] }) { if (!rows.length) return <div className="mt-6 rounded-xl border bg-white p-8 text-center text-slate-500">Generate a report to view results.</div>; const headers = Object.keys(rows[0]); return <div className="mt-6 overflow-auto rounded-xl border bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="p-3">{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index} className="border-t">{headers.map((header) => <td key={header} className="max-w-xs truncate p-3">{String(row[header] ?? "")}</td>)}</tr>)}</tbody></table></div>; }
function LogPanel({ title, icon, rows }: { title: string; icon: ReactNode; rows: Record<string, any>[] }) { return <div className="rounded-2xl border bg-white p-5"><h2 className="flex items-center gap-2 font-bold">{icon}{title}</h2><div className="mt-3 max-h-[40rem] divide-y overflow-auto">{rows.map((row) => <div key={row.id} className="py-3 text-xs"><p className="font-bold">{row.action ?? row.operation ?? row.reason ?? "event"}</p><p className="mt-1 break-all text-slate-500">{row.target ?? row.sessionId ?? row.correlationId ?? row.id}</p></div>)}</div></div>; }
function AdminScorecardDetails({ scorecard }: { scorecard: Record<string, any> }) { return <div className="mt-4"><p className="text-2xl font-bold text-indigo-600">{scorecard.total}/100</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{Object.values(scorecard.criteria ?? {}).map((criterion: any) => <div key={criterion.category} className="rounded-lg bg-indigo-50 p-3 text-sm"><div className="flex justify-between font-bold"><span>{String(criterion.category).replace(/([A-Z])/g, " $1")}</span><span>{criterion.score}/25</span></div><p className="mt-1 text-xs text-slate-600">{criterion.reason}</p></div>)}</div></div>; }
function AdminSolutionDetails({ solution }: { solution: Record<string, any> }) { return <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-bold uppercase text-emerald-700">Released solution</p><p className="mt-2 text-sm"><strong>Method:</strong> {solution.method}</p><p className="mt-2 text-sm"><strong>Justification:</strong> {solution.justification}</p><ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">{(solution.steps ?? []).map((step: string) => <li key={step}>{step}</li>)}</ol><p className="mt-3 text-sm"><strong>Answer:</strong> {solution.answer}</p><p className="mt-2 text-sm"><strong>Verification:</strong> {solution.verification}</p><p className="mt-2 text-sm"><strong>Interpretation:</strong> {solution.interpretation}</p></div>; }
