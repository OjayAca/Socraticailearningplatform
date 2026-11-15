# MINDGUIDE Workflow v6 Data Dictionary & Pedagogical Reference

This document specifies the data structures and additive fields persisted in Firestore and projected through `/api/learning` for MINDGUIDE (`SCHEMA_VERSION = 5`, `WORKFLOW_VERSION = 6`). All additive fields preserve backwards compatibility with existing v6 sessions and historical v1–v5 records.

---

## 1. `sessions/{sessionId}` Document

| Field | Type | Description |
| :--- | :--- | :--- |
| `schemaVersion` | `number` (`5`) | Schema version identifier. |
| `workflowVersion` | `number` (`6`) | Socratic workflow version identifier. |
| `revision` | `number` | Optimistic concurrency revision counter incremented on each mutation. |
| `status` | `SessionStatus` | `"in_progress" \| "ready_for_submission" \| "submitted" \| "reviewed" \| "returned" \| "abandoned" \| "expired"`. |
| `currentPhase` | `SessionPhase` | Active internal reasoning gate or post-reasoning phase (`problem_understanding` .. `critical_thinking_scorecard`). |
| `instructionalLevel` | `Difficulty` (optional) | Cross-session problem complexity (`"Basic" \| "Intermediate" \| "Advanced"`). |
| `promptAdjustment` | `PromptAdjustment` | In-session conversational scaffolding (`"simplify" \| "maintain" \| "deepen"`). |
| `recoveryMode` | `boolean` (optional) | Controlled recovery flag set to `true` when a learner reaches $\ge 3$ unaccepted corrective cycles on the active checkpoint; cleared to `false` when the checkpoint is accepted. |
| `gateStates` / `gateEvaluations` | `Record<ReasoningPhase, GateEvaluation>` | Per-checkpoint evaluation state, including `outcome`, `demonstrated`, `missingCriterion`, `selfCorrected`, `attemptCount`, and `correctiveCycleCount`. |
| `lastDiagnosis` | `ErrorDiagnosis \| null` | Most recent structured diagnosis with `category`, `incorrectStep`, `explanation`, `evidence`, `confidence`, `correctivePrompt`, `recommendedAction`, and `resolutionStatus`. |
| `diagnosisSummary` | `DiagnosisCategory[]` | Confirmed (`high`-confidence) error categories recorded during the session. |
| `tentativeDiagnoses` | `DiagnosisCategory[]` (optional) | Tentative (`medium`-confidence) error categories recorded during the session. |
| `selfCorrectedCategories` | `DiagnosisCategory[]` (optional) | Error categories independently self-corrected by the learner in this session. |
| `resolvedMisconceptions` | `DiagnosisCategory[]` (optional) | Misconception categories resolved during this session. |
| `supportHistory` | `SupportEvent[]` | Chronological log of support requests (`phase`, `level`, `hintLevel`, `title`, `content`, `requestedAt`). |
| `supportSummary` | `SupportSummary` (optional) | Aggregated support metrics separating `highestHintLevel` (`0..3`) from `solutionUnlocked` (`boolean`). |
| `scorecard` | `ScorecardResult \| null` | Calibrated 4-criterion Critical Thinking Scorecard (`0..100`), including `supportSummary` and `nextPracticeRecommendation`. |
| `releasedSolution` | `ReleasedSolution \| null` | Complete worked explanation, stripped by `studentSession` unless all four stages are completed and the scorecard is finalized. |
| `adaptiveRecommendation` | `AdaptiveRecommendation \| null` | Topic-level difficulty recommendation including `decisionLabel` and `masteryStatus`. |

---

## 2. `GateEvaluation` (`sessions/{sessionId}.gateEvaluations[phase]`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `phase` | `ReasoningPhase` | Internal checkpoint identifier. |
| `status` | `GateStatus` | `"locked" \| "pending" \| "needs_revision" \| "accepted"`. |
| `outcome` | `ResponseOutcome` (optional) | `"correct_complete" \| "correct_incomplete" \| "incorrect" \| "unclear"`. |
| `selfCorrected` | `boolean` (optional) | `true` when the checkpoint was accepted after $\ge 1$ prior corrective cycle without substantive hints (`targeted_hint`, `stronger_hint`, `partial_step`) in that phase; neutral `socratic_prompt` is allowed. |
| `demonstrated` | `string[]` (optional) | Cumulative accepted learner evidence statements preserved across partial attempts and selective stage regressions. |
| `missingCriterion` | `ReasoningPhase \| null` (optional) | Specific sub-criterion still needed when `outcome === "correct_incomplete"`. |
| `attemptCount` | `number` | Total answer submissions evaluated at this gate. |
| `correctiveCycleCount` | `number` | Total unaccepted answer attempts at this gate. |

---

## 3. `SupportSummary` (`sessions/{sessionId}.supportSummary` & `scorecard.supportSummary`)

| Field | Type | Description |
| :--- | :--- | :--- |
| `hintsRequested` | `number` | Total support events recorded in `supportHistory`. |
| `highestHintLevel` | `0 \| 1 \| 2 \| 3` | Highest hint tier reached during reasoning (`0` = none / `socratic_prompt`, `1` = Conceptual `targeted_hint`, `2` = Strategic `stronger_hint`, `3` = Procedural `partial_step`). Never conflated with complete solution release. |
| `solutionUnlocked` | `boolean` | `true` only after all four Socratic stages are accepted and the worked solution (Level 4) is unlocked via `finalizeScorecard`. |
| `correctiveAttempts` | `number` | Sum of `correctiveCycleCount` across evaluated checkpoints. |
| `selfCorrections` | `number` | Count of checkpoints where `selfCorrected === true`. |
| `completedIndependentlyAfterSupport` | `boolean` | `true` when all checkpoints are accepted and the final interpretation checkpoint did not require Level 2 or Level 3 hints. |

---

## 4. `learning_progress/{uid}` Document

| Field | Type | Description |
| :--- | :--- | :--- |
| `sessionsCompleted` | `number` | Total submitted learning sessions. |
| `scoreTotal` / `averageCTScore` | `number` | Cumulative and average Critical Thinking Scorecard totals (`0..100`). |
| `subjectProgress` | `Record<Subject, SubjectProgress>` | Per-subject completion count, average score, and recommended difficulty. |
| `topicRecommendations` | `Record<string, AdaptiveRecommendation>` | Per-topic adaptive difficulty recommendation, including `decision` (`"advance" \| "maintain_mixed_evidence" \| "maintain_insufficient_evidence" \| "remediation"`), `decisionLabel` (`"Advance" \| "Maintain" \| "Remediate"`), `masteryStatus` (`"Mastered" \| "Developing" \| "Needs remediation"`), `cooldownSessionsRemaining`, and 6-dimension `evidence`. |
| `misconceptionProfile` | `Record<string, PersistentMisconceptionRecord>` (optional) | Cross-session misconception tracker keyed by `${topicId}__${category}` recording `status` (`"tentative" \| "confirmed" \| "resolved"`), `confidence`, `occurrences`, `distinctSessionIds`, `lastSeenAt`, `lastResolvedAt`, and `consecutiveResolvedSessions`. |
