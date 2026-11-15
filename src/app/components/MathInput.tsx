import { Tooltip } from "./ui/tooltip";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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

export interface MathInputProps {
  value: MathResponse;
  onChange: (value: MathResponse) => void;
  notationOnly?: boolean;
  maxLength?: number;
  disabled?: boolean;
  label?: string;
  explanationPlaceholder?: string;
  notationHint?: string;
  notationHeaderActions?: React.ReactNode;
}

const SYMBOLS = [
  ["a/b", "Fraction", "\\frac{#0}{#?}"],
  ["xⁿ", "Exponent", "^{#?}"],
  ["√x", "Radical", "\\sqrt{#0}"],
  ["xₙ", "Subscript", "_{#?}"],
  ["≤", "less than or equal to", "\\le"],
  ["≥", "greater than or equal to", "\\ge"],
  ["≠", "not equal to", "\\ne"],
  ["∧", "logical AND", "\\land"],
  ["∨", "logical OR", "\\lor"],
  ["¬", "logical NOT", "\\neg"],
  ["∈", "element of", "\\in"],
  ["⊆", "subset of or equal to", "\\subseteq"],
] as const;

/**
 * Renders a plain-text reasoning/problem input paired with an optional,
 * collapsible LaTeX mathematical expression editor powered by MathLive and KaTeX.
 *
 * @param props - Component configuration and controlled value callbacks.
 * @returns The rendered mathematical input element.
 */
export function MathInput({
  value,
  onChange,
  notationOnly = false,
  maxLength = 4000,
  disabled = false,
  label = "Your reasoning",
  explanationPlaceholder = "Explain your reasoning in words...",
  notationHint,
  notationHeaderActions,
}: MathInputProps) {
  const fieldRef = useRef<MathFieldElement | null>(null);
  const explanationId = useId();
  const notationPanelId = useId();
  const [isNotationOpen, setIsNotationOpen] = useState(false);

  const hasNotationValue = Boolean(value.latex?.trim());
  const hasMathPlaceholder = value.plainText.includes("[math]");
  const isNotationExpanded = notationOnly || isNotationOpen || hasNotationValue || hasMathPlaceholder;

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

  const handleInsertPlaceholder = () => {
    if (hasMathPlaceholder) return;
    const separator = value.plainText && !value.plainText.endsWith(" ") ? " " : "";
    onChange({ ...value, plainText: `${value.plainText}${separator}[math]` });
  };

  return (
    <div className="space-y-3">
      {!notationOnly && (
        <div>
          <label className="mb-2 block text-sm font-bold text-slate-800 dark:text-slate-100" htmlFor={explanationId}>
            {label}
          </label>
          <textarea
            id={explanationId}
            disabled={disabled}
            value={value.plainText}
            onChange={(event) => onChange({ ...value, plainText: event.target.value })}
            maxLength={maxLength}
            rows={4}
            placeholder={explanationPlaceholder}
            className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-4 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>
      )}

      <div>
        {!notationOnly && (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={isNotationExpanded}
              aria-controls={notationPanelId}
              onClick={() => setIsNotationOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
            >
              {isNotationExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              <span>Mathematical notation (optional)</span>
              {hasNotationValue && !isNotationExpanded && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  Added
                </span>
              )}
            </button>
            {notationHeaderActions}
          </div>
        )}

        <div
          id={notationPanelId}
          className={
            isNotationExpanded
              ? `${notationOnly ? "space-y-2" : "mt-2 rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50/70 dark:bg-slate-900/50 p-3 space-y-2.5"}`
              : "hidden"
          }
        >
          {!notationOnly && notationHint && (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span>{notationHint}</span>
              {!hasMathPlaceholder && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={handleInsertPlaceholder}
                  className="rounded-md border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900 disabled:opacity-50"
                >
                  + Insert [math] in problem
                </button>
              )}
            </div>
          )}

          <div
            className="flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-1"
            role="toolbar"
            aria-label="Mathematical symbols"
          >
            {SYMBOLS.map(([name, description, command]) => (
              <Tooltip key={description} label={`Insert ${description}`}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    fieldRef.current?.insert(command);
                    fieldRef.current?.focus();
                  }}
                  className="min-w-8 rounded-md px-2 py-1 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-600 disabled:opacity-50"
                  aria-label={`Insert ${description}`}
                >
                  {name}
                </button>
              </Tooltip>
            ))}
          </div>

          <math-field
            ref={(element) => {
              fieldRef.current = element as MathFieldElement | null;
            }}
            value={value.latex ?? ""}
            aria-label="Mathematical expression editor"
            virtual-keyboard-mode="onfocus"
            className="block min-h-11 min-w-0 max-w-full w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-slate-900 dark:text-slate-100 text-lg focus-within:ring-2 focus-within:ring-indigo-600"
          />

          {preview.error ? (
            <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
              {preview.error}
            </p>
          ) : preview.html ? (
            <div
              className="overflow-x-auto rounded-lg bg-white dark:bg-slate-950 px-3 py-2 border border-slate-100 dark:border-slate-800"
              aria-label="Rendered equation preview"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
