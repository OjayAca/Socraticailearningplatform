import { useEffect, useState } from "react";
import { adminPilotRoster, adminSetPilot, getPilotStatus, type PilotStatus } from "@/lib/secure-api";

export function PilotControls() {
  const [state, setState] = useState<PilotStatus["state"]>("closed");
  const [actual, setActual] = useState("Loading cohort metadata…");
  const [topics, setTopics] = useState("");
  const [artifact, setArtifact] = useState("");
  const [uid, setUid] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPilotStatus()
      .then((value) => {
        setActual(value.state);
        setState(value.state);
        setTopics(value.enabledTopicIds.join("\n"));
        setArtifact(value.releaseArtifactId ?? "");
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Failed to load pilot status."));
  }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const result = await adminSetPilot({
        state,
        enabledTopicIds: topics.split(/\s+/).filter(Boolean),
        ...(artifact ? { releaseArtifactId: artifact } : {}),
      });
      setActual(result.state);
      setMessage("Cohort metadata saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Pilot update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function admission(status: "admitted" | "revoked") {
    setBusy(true);
    setMessage("");
    try {
      await adminPilotRoster(uid.trim(), status);
      setMessage(`Cohort admission ${status}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Roster update failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
        <p role="status" className="text-sm text-slate-600 dark:text-slate-400">
          Recorded cohort state: <strong className="text-slate-950 dark:text-white font-bold">{actual}</strong>
        </p>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">These settings retain cohort records. Learning access is determined by active accounts and approved content; cohort state does not block access.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-bold text-slate-950 dark:text-white">
          Release state
          <select
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white p-2.5 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={state}
            onChange={(event) => setState(event.target.value as PilotStatus["state"])}
          >
            <option value="closed">Closed</option>
            <option value="open">Open (cohort record)</option>
            <option value="drain">Drain (cohort record)</option>
            <option value="write-freeze">Frozen (cohort record)</option>
          </select>
        </label>

        <label className="block text-sm font-bold text-slate-950 dark:text-white">
          Approved release artifact ID
          <input
            className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white p-2.5 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={artifact}
            onChange={(event) => setArtifact(event.target.value)}
          />
        </label>
      </div>

      <label className="block text-sm font-bold text-slate-950 dark:text-white">
        Cohort topic IDs, one per line
        <textarea
          className="mt-1.5 block w-full rounded-xl border border-slate-200 bg-white p-2.5 font-mono text-sm font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          rows={3}
          value={topics}
          onChange={(event) => setTopics(event.target.value)}
        />
      </label>

      <button
        disabled={busy}
        onClick={() => void save()}
        className="rounded-xl bg-indigo-600 px-5 py-2.5 font-bold text-white shadow-sm transition hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50"
      >
        Save release controls
      </button>

      <hr className="border-slate-200 dark:border-slate-800" />

      <div>
        <h2 className="text-base font-bold text-slate-950 dark:text-white">Participant admission</h2>
        <label className="mt-3 block text-sm font-bold text-slate-950 dark:text-white">
          Verified Firebase Auth UID
          <input
            className="mt-1.5 block w-full max-w-md rounded-xl border border-slate-200 bg-white p-2.5 font-normal text-slate-950 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={uid}
            onChange={(event) => setUid(event.target.value)}
          />
        </label>
        <div className="mt-4 flex gap-3">
          <button
            disabled={busy || !uid.trim()}
            onClick={() => void admission("admitted")}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Admit participant
          </button>
          <button
            disabled={busy || !uid.trim()}
            onClick={() => void admission("revoked")}
            className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 font-bold text-rose-700 shadow-sm transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
          >
            Revoke admission
          </button>
        </div>
      </div>

      {message && (
        <div
          role="status"
          className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm font-semibold text-indigo-900 dark:border-indigo-900/50 dark:bg-indigo-950/30 dark:text-indigo-200"
        >
          {message}
        </div>
      )}
    </section>
  );
}
