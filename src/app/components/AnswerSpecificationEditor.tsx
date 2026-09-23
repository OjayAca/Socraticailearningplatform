import { useState } from "react";

/** Explicit answer data: never infer scoring answers from display prose. */
export function AnswerSpecificationEditor({ value, onChange, scalarOnly = false, label = "Scoring answer" }: {
  value?: Record<string, any>; onChange: (value: Record<string, any>) => void; scalarOnly?: boolean; label?: string;
}) {
  const [partName, setPartName] = useState("");
  const [error, setError] = useState("");
  const kind = value?.kind ?? "";
  const inputClass = "mt-1 w-full rounded-lg border p-2 dark:bg-slate-800";
  const change = (field: string, next: unknown) => onChange({ ...value, [field]: next });
  return <fieldset className="mt-4 rounded-xl border p-4 space-y-3">
    <legend className="font-bold">{label}</legend>
    <label className="block">Answer type<select className={inputClass} value={kind} onChange={event => {
      const next = event.target.value;
      onChange(next === "proof" ? { kind: next, conclusion: "", requirements: [] } : next === "parts" ? { kind: next, parts: {} } : next === "set" ? { kind: next, values: [] } : next === "expression" ? { kind: next, expression: "" } : next === "truth" ? { kind: next, value: true } : { kind: next, value: "" });
    }}><option value="" disabled>Select answer type</option>{["number", "expression", "truth", "set", ...(!scalarOnly ? ["parts", "proof"] : [])].map(item => <option key={item} value={item}>{item}</option>)}</select></label>
    {kind === "proof" && <><label className="block">Required conclusion<textarea className={inputClass} value={value?.conclusion ?? ""} onChange={event=>change("conclusion",event.target.value)} /></label><label className="block">Proof requirements (one per line)<textarea className={inputClass} value={(value?.requirements ?? []).join("\n")} onChange={event=>change("requirements",event.target.value.split("\n"))} /></label><p className="text-sm">The AI evaluates logical validity and accepts alternative valid proofs against these reviewed requirements.</p></>}
    {kind === "number" && <>
      <label className="block">Numeric answer<input className={inputClass} type="number" step="any" value={value?.value ?? ""} onChange={event => change("value", event.target.value === "" ? "" : Number(event.target.value))} /></label>
      <label className="block">Tolerance (optional)<input className={inputClass} type="number" min="0" step="any" value={value?.tolerance ?? ""} onChange={event => { const next = { ...value }; if (event.target.value === "") delete next.tolerance; else next.tolerance = Number(event.target.value); onChange(next); }} /></label>
      <label className="block">Unit (optional)<input className={inputClass} value={value?.unit ?? ""} onChange={event => change("unit", event.target.value)} /></label>
    </>}
    {kind === "expression" && <label className="block">Expected expression<input className={inputClass} value={value?.expression ?? ""} onChange={event => change("expression", event.target.value)} /></label>}
    {kind === "truth" && <label className="block">Truth value<select className={inputClass} value={String(value?.value)} onChange={event => change("value", event.target.value === "true")}><option value="true">True</option><option value="false">False</option></select></label>}
    {kind === "set" && <label className="block">Set members (one number per line; blank for empty set)<textarea className={inputClass} value={(value?.values ?? []).join("\n")} onChange={event => change("values", event.target.value === "" ? [] : event.target.value.split("\n").map(item => item.trim() !== "" && Number.isFinite(Number(item)) ? Number(item) : item))} /></label>}
    {kind === "parts" && <>
      {Object.entries(value?.parts ?? {}).map(([name, part]) => <div key={name}>
        <AnswerSpecificationEditor label={`Part: ${name}`} scalarOnly value={part as Record<string, any>} onChange={next => change("parts", { ...value?.parts, [name]: next })} />
        <button type="button" className="underline" onClick={() => { const parts = { ...value?.parts }; delete parts[name]; change("parts", parts); }}>Remove part {name}</button>
      </div>)}
      <label className="block">New part name<input className={inputClass} value={partName} onChange={event => setPartName(event.target.value)} /></label>
      <button type="button" className="rounded-lg border p-2" onClick={() => {
        const name = partName.trim();
        if (!/^[A-Za-z0-9_-]{1,40}$/.test(name) || Object.hasOwn(value?.parts ?? {}, name) || ["__proto__", "constructor", "prototype"].includes(name)) { setError("Use a unique part name containing letters, numbers, underscores, or hyphens."); return; }
        change("parts", { ...value?.parts, [name]: { kind: "number", value: "" } }); setPartName(""); setError("");
      }}>Add part</button>
      {error && <p role="alert">{error}</p>}
    </>}
  </fieldset>;
}
