import { useEffect, useState, type FormEvent } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { adminUpsertContent } from "@/lib/secure-api";

const fields = [
  ["currentConsentVersion", "Active consent policy ID", "text"],
  ["policyEvidenceReference", "Policy evidence reference", "text"],
  ["sessionInactivityHours", "Session inactivity hours (checked on access)", "number"],
  ["aiLogRetentionDays", "Legacy AI log retention days (manual policy)", "number"],
  ["identifiableRetentionMonths", "Identifiable record retention months (manual policy)", "number"],
  ["studyClosedAt", "Study closure date (record only)", "date"],
] as const;

export function AdminPrivacySettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState(db ? "" : "Database configuration is unavailable.");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "system_settings", "privacy")).then(snapshot => {
      const data = snapshot.data() ?? {};
      const closed = data.studyClosedAt?.toDate?.() ?? (data.studyClosedAt ? new Date(data.studyClosedAt) : null);
      setValues(Object.fromEntries(fields.map(([key]) => [key, key === "studyClosedAt" ? (closed && !Number.isNaN(closed.getTime()) ? new Date(closed.getTime() + 8 * 3600000).toISOString().slice(0, 10) : "") : String(data[key] ?? "")])));
      setLoaded(true);
    }).catch(cause => setMessage(cause instanceof Error ? cause.message : "Settings could not be loaded."));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!loaded || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const value: Record<string, unknown> = { currentConsentVersion: values.currentConsentVersion?.trim(), studyClosedAt: values.studyClosedAt ? Date.parse(`${values.studyClosedAt}T00:00:00+08:00`) : null };
      for (const [key, , type] of fields) {
        if (key === "currentConsentVersion" || key === "studyClosedAt" || !values[key]?.trim()) continue;
        value[key] = type === "number" ? Number(values[key]) : values[key].trim();
      }
      await adminUpsertContent({ collection: "system_settings", id: "privacy", value });
      setMessage("Settings saved and audited.");
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Settings failed."); }
    finally { setBusy(false); }
  }
  return <>
    <p className="mt-4 text-sm">The consent policy must already exist and be active. Dates use Manila time. Blank optional values use application defaults; cleanup remains an operator task.</p>
    {message && <p role="status" className="mt-4">{message}</p>}
    {!loaded && !message && <p role="status">Loading settings…</p>}
    <form onSubmit={event => void save(event)} className="mt-6 grid max-w-2xl gap-4">
      {fields.map(([key, label, type]) => <label key={key} className="grid gap-2 text-sm font-semibold">{label}<input type={type} required={key === "currentConsentVersion"} disabled={!loaded || busy} value={values[key] ?? ""} onChange={event => setValues(previous => ({ ...previous, [key]: event.target.value }))} min={type === "number" ? key === "identifiableRetentionMonths" ? 0 : 1 : undefined} max={key === "sessionInactivityHours" ? 720 : key === "aiLogRetentionDays" ? 3650 : key === "identifiableRetentionMonths" ? 120 : undefined} step={type === "number" ? key === "identifiableRetentionMonths" ? "any" : 1 : undefined} className="rounded-xl border border-slate-300 bg-white p-3 text-slate-950 dark:bg-slate-900 dark:text-white" /></label>)}
      <button disabled={!loaded || busy} className="rounded-xl bg-indigo-600 p-3 font-bold text-white disabled:opacity-50">Save audited settings</button>
    </form>
  </>;
}
