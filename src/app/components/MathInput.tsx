import { Tooltip } from "./ui/tooltip";
import { useEffect, useId, useMemo, useRef } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
// Bundle MathLive's fonts with Next.js and enable its static-font loading mode.
import "mathlive/fonts.css";
import "mathlive";
import type { MathResponse } from "@mindguide/contracts";

type MathFieldElement = HTMLElement & {
  value: string;
  insert: (value: string) => void;
  focus: () => void;
  readOnly: boolean;
};

const SYMBOLS = [
  ["Fraction", "Fraction", "\\frac{#0}{#?}"],
  ["Exponent", "Exponent", "^{#?}"],
  ["Radical", "Radical", "\\sqrt{#0}"],
  ["Subscript", "Subscript", "_{#?}"],
  ["≤", "less than or equal to", "\\le"],
  ["≥", "greater than or equal to", "\\ge"],
  ["≠", "not equal to", "\\ne"],
  ["∧", "logical AND", "\\land"],
  ["∨", "logical OR", "\\lor"],
  ["¬", "logical NOT", "\\neg"],
  ["∈", "element of", "\\in"],
  ["⊆", "subset of or equal to", "\\subseteq"],
] as const;

export function MathInput({
  value,
  onChange,
  notationOnly = false,
  disabled = false,
  label = "Your reasoning",
  explanationPlaceholder = "Explain your reasoning in words...",
}: {
  value: MathResponse;
  onChange: (value: MathResponse) => void;
  notationOnly?: boolean;
  disabled?: boolean;
  label?: string;
  explanationPlaceholder?: string;
}) {
  const fieldRef = useRef<MathFieldElement | null>(null);
  const explanationId = useId();

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;
    field.readOnly = disabled;
    if (field.value !== (value.latex ?? "")) field.value = value.latex ?? "";
    const handleInput = () => onChange({ ...value, latex: field.value });
    field.addEventListener("input", handleInput);
    return () => field.removeEventListener("input", handleInput);
  }, [disabled, onChange, value]);

  const preview = useMemo<{ html: string; error: string | null }>(() => {
    if (!value.latex?.trim()) {
      return { html: "", error: null };
    }
    try {
      const html = katex.renderToString(value.latex, {
        throwOnError: true,
        strict: "error",
        displayMode: true,
      });
      return { html, error: null };
    } catch {
      return { html: "", error: "Check the mathematical notation before submitting." };
    }
  }, [value.latex]);

  return (
    <div className="space-y-4">
      {!notationOnly && <div>
        <label className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100" htmlFor={explanationId}>
          {label}
        </label>
        <textarea
          id={explanationId}
          disabled={disabled}
          value={value.plainText}
          onChange={(event) => onChange({ ...value, plainText: event.target.value })}
          maxLength={4000}
          rows={5}
          placeholder={explanationPlaceholder}
          className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-600"
        />
      </div>}

      <div className="space-y-2">
        <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">Mathematical notation (optional)</span>
        <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Mathematical symbols">
          {SYMBOLS.map(([name, description, command]) => (
            <Tooltip key={name} label={`Insert ${description}`}><button
              key={name}
              type="button"
              disabled={disabled}
              onClick={() => {
                fieldRef.current?.insert(command);
                fieldRef.current?.focus();
              }}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600"
              aria-label={`Insert ${description}`}
            >
              {name}
            </button></Tooltip>
          ))}
        </div>
        <math-field
          ref={(element) => {
            fieldRef.current = element as MathFieldElement | null;
          }}
          value={value.latex ?? ""}
          aria-label="Mathematical expression editor"
          virtual-keyboard-mode="onfocus"
          className="block min-h-14 min-w-0 max-w-full w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 text-slate-900 dark:text-slate-100 text-xl focus-within:ring-2 focus-within:ring-indigo-600"
        />
        {preview.error ? (
          <p className="text-sm font-medium text-red-600 dark:text-red-400" role="alert">{preview.error}</p>
        ) : preview.html ? (
          <div className="overflow-x-auto rounded-xl bg-slate-50 dark:bg-slate-950 p-3" aria-label="Rendered equation preview" dangerouslySetInnerHTML={{ __html: preview.html }} />
        ) : null}
      </div>
      {!notationOnly && <p className="text-xs text-slate-500 dark:text-slate-400">Keyboard-entered text and LaTeX are supported. Images, handwriting, OCR, and graphical input are not accepted.</p>}
    </div>
  );
}
