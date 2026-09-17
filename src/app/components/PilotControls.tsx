import { useEffect, useState } from "react";
import { adminPilotRoster, adminSetPilot, getPilotStatus, type PilotStatus } from "@/lib/secure-api";

export function PilotControls() {
  const [state, setState] = useState<PilotStatus["state"]>("closed");
  const [actual, setActual] = useState("Loading server state…");
  const [topics, setTopics] = useState("");
  const [artifact, setArtifact] = useState("");
  const [uid, setUid] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { getPilotStatus().then(value => { setActual(value.state); setState(value.state); setTopics(value.enabledTopicIds.join("\n")); setArtifact(value.releaseArtifactId ?? ""); }).catch(error => setMessage(error.message)); }, []);
  async function save() {
    setBusy(true); setMessage("");
    try { const result = await adminSetPilot({ state, enabledTopicIds: topics.split(/\s+/).filter(Boolean), ...(artifact ? { releaseArtifactId: artifact } : {}) }); setActual(result.state); setMessage("Pilot controls saved and audited."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Pilot update failed."); } finally { setBusy(false); }
  }
  async function admission(status: "admitted" | "revoked") {
    setBusy(true); setMessage("");
    try { await adminPilotRoster(uid.trim(), status); setMessage(`Cohort admission ${status}.`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Roster update failed."); } finally { setBusy(false); }
  }
  return <section className="mt-6 space-y-4 rounded-xl border bg-white p-6 dark:bg-slate-900">
    <p role="status">Server release state: <strong>{actual}</strong></p>
    <label className="block">Release state<select className="ml-3 rounded border p-2" value={state} onChange={event => setState(event.target.value as PilotStatus["state"])}><option value="closed">Closed</option><option value="open">Open to admitted participants</option><option value="drain">Drain existing sessions</option><option value="write-freeze">Freeze learning and content changes</option></select></label>
    <label className="block">Enabled topic IDs, one per line<textarea className="mt-2 block w-full rounded border p-2" rows={3} value={topics} onChange={event => setTopics(event.target.value)} /></label>
    <label className="block">Approved release artifact ID<input className="ml-3 rounded border p-2" value={artifact} onChange={event => setArtifact(event.target.value)} /></label>
    <button disabled={busy} onClick={() => void save()} className="rounded bg-indigo-700 px-4 py-2 text-white">Save release controls</button>
    <hr /><h2 className="font-bold">Participant admission</h2>
    <label className="block">Verified Firebase Auth UID<input className="ml-3 rounded border p-2" value={uid} onChange={event => setUid(event.target.value)} /></label>
    <div className="flex gap-3"><button disabled={busy || !uid.trim()} onClick={() => void admission("admitted")} className="rounded border px-4 py-2">Admit participant</button><button disabled={busy || !uid.trim()} onClick={() => void admission("revoked")} className="rounded border px-4 py-2">Revoke admission</button></div>
    {message && <p role="status">{message}</p>}
  </section>;
}
