import type { ScorecardResult } from "@mindguide/contracts";
import { presentScorecard, SCORECARD_CATEGORY_LABELS } from "@/lib/scorecard-presentation";

export function ScorecardDetails({ scorecard, compact = false }: { scorecard: ScorecardResult; compact?: boolean }) {
  const presentation = presentScorecard(scorecard);
  return (
    <section className="mt-4 space-y-4" aria-label="Critical Thinking Scorecard">
      {scorecard.rubricVersion === "spark-practice-v1" && <p className="text-sm text-slate-600 dark:text-slate-300">Calculated in your browser for practice; this is not an official assessment.</p>}
      {scorecard.rubricVersion === "ai-formative-v1" && <p className="text-sm text-slate-600 dark:text-slate-300">AI-supported formative feedback based on your saved reasoning. This is not an official grade.</p>}
      <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{scorecard.total}/100</p>
      <p className="text-sm">Rubric: {scorecard.rubricVersion ?? "legacy"} · {scorecard.calibrationStatus ?? "uncalibrated"} · Assistance: {scorecard.assistanceCount ?? "not recorded"}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {presentation.criteria.map((criterion) => (
          <div key={criterion.category} className="rounded-lg bg-indigo-50 p-3 text-sm text-slate-900 dark:bg-indigo-950/40 dark:text-indigo-100">
            <div className="flex justify-between font-bold">
              <span>{SCORECARD_CATEGORY_LABELS[criterion.category]}</span><span>{criterion.score}/25</span>
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{criterion.reason}</p>
            {!compact && <p className="mt-2 text-xs font-semibold text-indigo-700 dark:text-indigo-300">Improve: {criterion.improvementAdvice}</p>}
            {!compact && scorecard.criteria[criterion.category].evidence.map((evidence,index)=><p key={index} className="mt-2 text-xs text-slate-600 dark:text-slate-300">Evidence: {evidence}</p>)}
          </div>
        ))}
      </div>
      {!compact && (
        <div className="grid gap-3 md:grid-cols-2">
          <Insight title="Strength" text={`${SCORECARD_CATEGORY_LABELS[presentation.strength.category]}: ${presentation.strength.reason}`} />
          <Insight title="Weakness" text={`${SCORECARD_CATEGORY_LABELS[presentation.weakness.category]}: ${presentation.weakness.reason}`} />
          <Insight title="Session summary" text={presentation.sessionSummary} />
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-sm font-bold text-slate-950 dark:text-white">Improvement plan</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
              {presentation.improvements.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function Insight({ title, text }: { title: string; text: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"><h3 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h3><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{text}</p></div>;
}
