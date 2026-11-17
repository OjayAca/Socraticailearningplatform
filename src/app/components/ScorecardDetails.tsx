import {
  SCORECARD_CATEGORY_DESCRIPTIONS,
  SCORECARD_CATEGORY_LABELS,
  presentScorecard,
  type PresentableScorecardInput,
} from "@/lib/scorecard-presentation";

/**
 * Renders a student's Critical Thinking Scorecard in alignment with `SCORECARD_RUBRIC`.
 * Guards safely against legacy scorecards lacking `criteria`, `calibrationStatus`, or `supportSummary`
 * without inventing missing scores, calibration states, or reasoning evidence.
 *
 * @param props.scorecard - Stored scorecard record (full v6 or partial historical scorecard).
 * @param props.compact - When `true`, hides extended coaching panels and improvement advice.
 */
export function ScorecardDetails({
  scorecard,
  compact = false,
}: {
  scorecard: PresentableScorecardInput;
  compact?: boolean;
}) {
  const presentation = presentScorecard(scorecard);

  return (
    <section className="mt-4 space-y-4" aria-label="Critical Thinking Scorecard">
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-950/60">
        {scorecard.rubricVersion === "spark-practice-v1" ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Calculated in your browser for practice; this is not an official assessment.
          </p>
        ) : (
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Formative AI-supported feedback for practice only — not an official academic grade.
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-3xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
            {scorecard.total}/100
          </p>
          {(scorecard.rubricVersion ||
            presentation.calibrationDisclosure ||
            presentation.assistanceCount !== null) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {scorecard.rubricVersion && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  Rubric: {scorecard.rubricVersion}
                </span>
              )}
              {presentation.calibrationDisclosure && (
                <span
                  className={`rounded-full px-2.5 py-1 font-medium ${
                    presentation.calibrationDisclosure.isCalibrated
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                  }`}
                >
                  {presentation.calibrationDisclosure.message}
                </span>
              )}
              {presentation.assistanceCount !== null && (
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                  Assistance requests: {presentation.assistanceCount}
                </span>
              )}
            </div>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-600 dark:text-slate-300">
          Total = Accuracy + Logical Validity + Method Selection + Explanation Quality (25 points each).
        </p>

        {!compact && presentation.supportSummary && (
          <div className="mt-3 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Support summary:
            </span>{" "}
            {presentation.supportSummary.hintsRequested}{" "}
            {presentation.supportSummary.hintsRequested === 1 ? "hint" : "hints"} (highest level{" "}
            {presentation.supportSummary.highestHintLevel}/3) ·{" "}
            {presentation.supportSummary.correctiveAttempts} corrective{" "}
            {presentation.supportSummary.correctiveAttempts === 1 ? "attempt" : "attempts"} ·{" "}
            {presentation.supportSummary.selfCorrections} independent{" "}
            {presentation.supportSummary.selfCorrections === 1
              ? "self-correction"
              : "self-corrections"}{" "}
            ·{" "}
            {presentation.supportSummary.completedIndependentlyAfterSupport
              ? "Completed independently"
              : "Required guided support"}
          </div>
        )}
      </div>

      {presentation.hasCriteria ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {presentation.criteria.map((criterion) => {
            const percent = Math.min(100, Math.max(0, Math.round((criterion.score / 25) * 100)));
            return (
              <article
                key={criterion.category}
                className="rounded-2xl border border-indigo-100 bg-indigo-50/70 p-4 text-sm text-slate-900 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-100"
              >
                <div className="flex items-center justify-between gap-2 font-bold">
                  <h3>{SCORECARD_CATEGORY_LABELS[criterion.category]}</h3>
                  <span className="text-indigo-700 dark:text-indigo-300">
                    {criterion.score}/25
                  </span>
                </div>

                <div
                  role="progressbar"
                  aria-label={`${SCORECARD_CATEGORY_LABELS[criterion.category]} score`}
                  aria-valuenow={criterion.score}
                  aria-valuemin={0}
                  aria-valuemax={25}
                  className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-indigo-200/70 dark:bg-indigo-900/60"
                >
                  <div
                    className="h-full rounded-full bg-indigo-600 transition-all motion-reduce:transition-none dark:bg-indigo-400"
                    style={{ width: `${percent}%` }}
                  />
                </div>

                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {SCORECARD_CATEGORY_DESCRIPTIONS[criterion.category]}
                </p>

                {criterion.reason && (
                  <p className="mt-2.5 text-xs leading-5 text-slate-700 dark:text-slate-200">
                    <span className="font-semibold">Why you received this score:</span>{" "}
                    {criterion.reason}
                  </p>
                )}

                {!compact && criterion.evidence.length > 0 && (
                  <div className="mt-2.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                    <p className="font-semibold text-slate-700 dark:text-slate-200">
                      Reasoning evidence:
                    </p>
                    <ul className="list-disc space-y-0.5 pl-4">
                      {criterion.evidence.map((evidence, index) => (
                        <li key={index}>{evidence}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {!compact && criterion.improvementAdvice && (
                  <p className="mt-2.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    How to improve: {criterion.improvementAdvice}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Detailed four-criterion breakdowns were not recorded on this legacy scorecard. Preserved
          total score and summary feedback are displayed as saved.
        </div>
      )}

      {!compact && (
        <div className="grid gap-3 md:grid-cols-2">
          {presentation.hasCriteria && (
            <>
              <Insight
                title="Strength"
                text={
                  presentation.strength
                    ? `${SCORECARD_CATEGORY_LABELS[presentation.strength.category]}: ${presentation.strength.reason}`
                    : presentation.tied
                      ? "All recorded criteria have the same score; no single relative strength is identified."
                      : "Only partial criterion data was recorded on this scorecard."
                }
              />
              <Insight
                title="Area for growth"
                text={
                  presentation.weakness
                    ? `${SCORECARD_CATEGORY_LABELS[presentation.weakness.category]}: ${presentation.weakness.improvementAdvice}`
                    : presentation.tied
                      ? "All recorded criteria have the same score. Review the criterion feedback for any shared areas to develop."
                      : "No specific area for growth was identified in the saved feedback."
                }
              />
            </>
          )}
          {presentation.sessionSummary && (
            <Insight title="Session summary" text={presentation.sessionSummary} />
          )}
          {presentation.nextPracticeRecommendation && (
            <Insight
              title="Recommended next practice"
              text={presentation.nextPracticeRecommendation}
            />
          )}
          {presentation.hasCriteria && (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-sm font-bold text-slate-950 dark:text-white">
                Improvement plan
              </h3>
              {!presentation.improvements.length ? (
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                  No specific improvement was identified in the saved feedback.
                </p>
              ) : (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-300">
                  {presentation.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Insight({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h3 className="text-sm font-bold text-slate-950 dark:text-white">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{text}</p>
    </div>
  );
}
