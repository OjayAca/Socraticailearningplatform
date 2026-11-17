import { useEffect, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { adminUpsertContent } from "@/lib/secure-api";
import { Alert } from "./ui/alert";
import { Skeleton } from "./ui/skeleton";

const fields = [
  ["currentConsentVersion", "Active consent policy ID", "text"],
  ["policyEvidenceReference", "Policy evidence reference", "text"],
  ["sessionInactivityHours", "Session inactivity hours (checked on access)", "number"],
  ["aiLogRetentionDays", "Legacy AI log retention days (manual policy)", "number"],
  ["identifiableRetentionMonths", "Identifiable record retention months (manual policy)", "number"],
  ["studyClosedAt", "Study closure date (record only)", "date"],
] as const;

/**
 * Typed editor for administrator-controlled privacy, consent, and inactivity settings.
 */
export function AdminPrivacySettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(
    db ? null : "Database configuration is unavailable.",
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, "system_settings", "privacy"))
      .then((snapshot) => {
        const data = snapshot.data() ?? {};
        const closed =
          data.studyClosedAt?.toDate?.() ??
          (data.studyClosedAt ? new Date(data.studyClosedAt) : null);
        setValues(
          Object.fromEntries(
            fields.map(([key]) => [
              key,
              key === "studyClosedAt"
                ? closed && !Number.isNaN(closed.getTime())
                  ? new Date(closed.getTime() + 8 * 3600000)
                      .toISOString()
                      .slice(0, 10)
                  : ""
                : String(data[key] ?? ""),
            ]),
          ),
        );
        setLoaded(true);
      })
      .catch((cause) =>
        setErrorMessage(
          cause instanceof Error ? cause.message : "Settings could not be loaded.",
        ),
      );
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!loaded || busy) return;
    setBusy(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const value: Record<string, unknown> = {
        currentConsentVersion: values.currentConsentVersion?.trim(),
        studyClosedAt: values.studyClosedAt
          ? Date.parse(`${values.studyClosedAt}T00:00:00+08:00`)
          : null,
      };
      for (const [key, , type] of fields) {
        if (key === "currentConsentVersion" || key === "studyClosedAt" || !values[key]?.trim())
          continue;
        value[key] = type === "number" ? Number(values[key]) : values[key].trim();
      }
      await adminUpsertContent({ collection: "system_settings", id: "privacy", value });
      setStatusMessage("Settings saved and audited.");
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Settings failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="mt-4 text-sm leading-6 text-slate-600 dark:text-slate-300">
        The consent policy must already exist and be active. Dates use Manila time. Blank optional
        values use application defaults; cleanup remains an operator task.
      </p>

      {errorMessage && (
        <Alert tone="error" onDismiss={() => setErrorMessage(null)}>
          {errorMessage}
        </Alert>
      )}
      {statusMessage && (
        <Alert tone="success" onDismiss={() => setStatusMessage(null)}>
          {statusMessage}
        </Alert>
      )}
      {!loaded && !errorMessage && (
        <div role="status" aria-label="Loading settings" className="max-w-2xl space-y-3">
          <span className="sr-only">Loading settings…</span>
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      )}

      <form onSubmit={(event) => void save(event)} className="mt-6 grid max-w-2xl gap-4">
        {fields.map(([key, label, type]) => (
          <label
            key={key}
            className="grid gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
          >
            {label}
            <input
              type={type}
              required={key === "currentConsentVersion"}
              disabled={!loaded || busy}
              value={values[key] ?? ""}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, [key]: event.target.value }))
              }
              min={
                type === "number"
                  ? key === "identifiableRetentionMonths"
                    ? 0
                    : 1
                  : undefined
              }
              max={
                key === "sessionInactivityHours"
                  ? 720
                  : key === "aiLogRetentionDays"
                    ? 3650
                    : key === "identifiableRetentionMonths"
                      ? 120
                      : undefined
              }
              step={
                type === "number"
                  ? key === "identifiableRetentionMonths"
                    ? "any"
                    : 1
                  : undefined
              }
              className="min-h-11 rounded-xl border border-slate-300 bg-white p-3 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </label>
        ))}
        <button
          type="submit"
          disabled={!loaded || busy}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-600 p-3 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
        >
          {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          <span>{busy ? "Saving settings..." : "Save audited settings"}</span>
        </button>
      </form>
    </div>
  );
}
