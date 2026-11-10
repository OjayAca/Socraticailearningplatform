# MINDGUIDE core features — implementation and verification

Date: 28 October 2026 (Asia/Manila). Work performed directly in the existing checkout. No remote application deployment, curriculum migration, question publication, learner-history reset, synthetic approval, emulator, or replacement database. Existing unrelated uncommitted work was preserved.

## Initial assessment

The initial complete suite passed **439 tests in 42 files**, superseding the older 104-test audit. The authoritative curriculum has two subjects and twelve topics. The active Next API already authenticates requests, uses the server LearningService and protected per-session references, enforces seven internal gates grouped into four learner-visible stages, checks revisions/ownership, recovers idempotent operations, and persists four-criterion formative scorecards. These implementations were retained.

Confirmed defects were nearest-level assignment after exhaustion; recommendations reusing easier-level performance and lacking durable evidence details; excluded-topic instructions in the active tutor prompt; generic feedback on explicit arithmetic inside semantic proof responses; and scorecard citations that could point at a learner message from the wrong stage. Structured source alternatives and misconceptions existed in the supplied bank but were not included in the tutor's pinned reference. The source bank has one question per topic/level, not five.

## Changes and files

| Files | Reason |
|---|---|
| `server/learning-policy.ts`, `server/gemini.ts`, `server/services/LearningService.ts` | Versioned topic/current-level mastery rules; distinct completed-question evidence; exact-level assignment; explicit exhaustion; stored reasons and thresholds. Retain the existing workflow version for session compatibility. |
| `src/data/validated-curriculum.ts`, `scripts/question-bank-core.ts` | Keep the approved hierarchy; reject excluded concepts even when placed under an approved topic. Runtime assignment also rejects excluded problem/reference content. Retired historical fixtures remain retired. |
| `server/mathematical-diagnosis.ts`, `server/gemini.ts`, `packages/contracts/src/index.ts` | Bounded arithmetic checks in prose, verified square-function substitution, structured corrective information, all requested category mappings, and uncertainty for unrecognized alternatives. |
| `src/lib/learning/method-references.ts`, `verified-problems.ts`, `workflow.ts` | Structured definitions, variables where applicable, conditions, misconceptions and accepted justifications for the 17 bounded custom-problem operations; existing deterministic solvers provide checked examples. |
| `server/services/LearningService.ts`, `server/gemini.ts`, `scripts/verify-question-bank-session.ts` | Verify the protected imported source hash and pin its assumptions, approved statements, valid alternatives, misconceptions and stage expectations for newly started prepared sessions. Older pinned references remain readable. |
| `server/scorecard-rubric.ts`, `server/services/LearningService.ts`, `src/app/components/ScorecardDetails.tsx` | Criterion-specific rubric, assessed stage-specific evidence IDs, source-authored released steps/answer/interpretation, unlock checkpoint record, and visible four-term total/formative label. |
| `src/lib/learning/validation.ts` | Prevent protected source guidance from entering public managed-content payloads. |
| `server/tutor-quota.ts`, `scripts/probe-core-tutor.ts` | Reuse normal quota reservations for bounded real-provider diagnostics; no fabricated student sessions or scores. |
| `scripts/audit-core-features.ts` | Repeatable read-only real-project coverage and excluded-content audit. |
| `eslint.config.js` | Exclude already Git-ignored local diagnostic/backup scripts from application lint. No application lint rules were weakened. |
| `tests/unit/ai-learning.test.ts`, `learning-policy.test.ts`, `mathematical-diagnosis.test.ts`, `method-references.test.ts`, `question-bank-import.test.ts`, `validated-curriculum.test.ts` | Regression, boundary, authorization, evidence, curriculum and reference tests. Existing acceptance assertions were retained; fixtures now provide actual level/stage evidence where the new requirements demand it. |

## Core-feature status

| Feature | Status | Evidence and remaining limit |
|---|---|---|
| Four-stage Socratic solver | **Implemented, verification pending** | Server transitions, client manipulation rejection, missing-working guard, persistence/recovery tests; historical live record reread. Fresh full browser workflows across all supported types remain unverified. |
| Formula/theorem justification | **Implemented, verification pending** | Structured bounded references plus original approved bank guidance; live invalid inverse-method rejection and valid table-method acceptance. Comprehensive educational validation across all references remains pending. |
| Diagnosis/misconception detection | **Implemented, verification pending** | Deterministic signed-square and arithmetic regression tests, category/uncertainty tests, live arithmetic replay. Arbitrary symbolic identities/proofs still require contextual AI assessment and are never labeled wrong merely because the bounded checker cannot parse them. |
| Adaptive difficulty | **Implemented, verification pending** | Strong/mixed/weak/insufficient/assisted/duplicate/topic/level scenarios and exhaustion tested locally. Live multi-session progression is blocked by bank depth and incomplete browser QA. |
| Progressive solution unlock | **Implemented, verification pending** | Ownership/stage/revision/direct-request tests; deployed rules simulator 63/63; protected bundle scan; server unlock record. Fresh live release under the updated build remains blocked. Generated hint prose still needs educational disclosure review across the bank. |
| Critical Thinking Scorecard | **Implemented, verification pending** | Four 0–25 criteria, sums, stage citations, wrong-stage rejection, source solution, idempotent persistence tests. Existing real scorecard matches Firestore. New rubric calibration and fresh displayed-versus-stored v2 verification remain pending. |

No feature is labeled academically effective or completely verified on the strength of mocks or a single provider replay.

## Approved question-bank coverage

Read-only Firebase verification found 36 approved questions, all 468 expected related documents, no missing answers/solutions/documents or duplicates, and all twelve topics enabled. No active question contains the excluded concepts. Source provenance and the existing approval record are unchanged.

| Subject | Approved topic | Basic | Intermediate | Advanced | Shortfall to 15 |
|---|---|---:|---:|---:|---:|
| Quantitative Methods | Functions | 1 | 1 | 1 | 12 |
| Quantitative Methods | Descriptive Statistics | 1 | 1 | 1 | 12 |
| Quantitative Methods | Introduction to Probability | 1 | 1 | 1 | 12 |
| Quantitative Methods | Probability Distributions | 1 | 1 | 1 | 12 |
| Quantitative Methods | Introduction to Decision Making | 1 | 1 | 1 | 12 |
| Quantitative Methods | Decision Analysis | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Speaking Mathematically | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Set Theory | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Relations and Functions | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Logic | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Combinatorics | 1 | 1 | 1 | 12 |
| Discrete Mathematics | Discrete Probability | 1 | 1 | 1 | 12 |
| **Total** | **12 topics** | **12** | **12** | **12** | **144** |

The target remains 180 distinct approved questions. No new questions or variants were activated. Mathematical authoring and independent validation of the additional 144 questions remain unfinished. The one-question Basic bank cannot establish three distinct completed prepared questions per topic: exhaustion now explains this limitation rather than promoting the learner. Review of completed sessions and retry after validated content becomes available are offered in the error message. Retakes are not silently enabled.

## Adaptive rules (provisional formative policy)

`ADAPTIVE_POLICY` in `server/learning-policy.ts` is the centralized configuration, stored with each recommendation as `topic-mastery-v1`. Changing it is a reviewed code/configuration change; legacy database difficulty-policy documents do not silently override this policy.

- Consider the latest five distinct completed questions, within the selected topic, current level and current workflow. Require submitted status, committed statistics, valid criterion scores and completion time. Deduplicate question IDs; exclude incomplete/abandoned/expired/failed sessions and missing assessment data.
- Require at least three eligible sessions before changing a level. Maintain the current level if evidence is insufficient.
- Advance one level only at accuracy, mean reasoning, method-selection and explanation/justification scores of at least 80%. At least 80% of the sessions must have no strong/partial/full assistance and at most one support event. No session in the window may require more than one corrective cycle in a gate.
- Reduce at most one level when mean accuracy or reasoning is below 50% and at least two sessions show such difficulty. At Basic, recommend remediation and remain Basic.
- Otherwise maintain. Clamp at Basic/Advanced. Keep assistance/correction evidence separate from the final-mastery score; no hint penalty was added to the scorecard.
- Persist considered session IDs, topic, level, means, assistance count, correction history, misconceptions, decision, policy version and thresholds. Assignment must match the recommendation exactly and pass existing approval/version/hash checks. Exhaustion never supplies mastery evidence.

## Diagnosis, reference and scoring policy

Requested categories map to existing `wrong_formula`/`theorem_condition_violation`, `procedural_error`, `computational_error`, `invalid_logic`, `skipped_reasoning`, `weak_justification`, `incorrect_interpretation`, plus new `unrecognized_alternative`. Diagnosis includes evidence, incorrect step where established, explanation, corrective question, action and confidence. Uncertain cases are clarification, not confirmed misconceptions. Historical records without the added fields remain compatible.

Deterministic coverage is deliberately bounded: explicit numerical equalities, ordinary arithmetic and function values where the trusted problem states `f(x)=x²`. Quoted/rejected/hypothetical mistakes, unsupported symbolic expressions and ambiguous questions are not automatically classified as errors. A bare final answer cannot complete computation without recorded working. Valid mathematical notation in the separate math field is retained.

The rubric remains Accuracy + Logical validity + Method selection + Explanation quality, each 0–25, total 100 possible. Criterion-specific strong (21–25), adequate (16–20), weak (6–15), incorrect/no-evidence (0–5) descriptions are sent to the tutor. Every score must cite assessed learner messages and at least one accepted response from that criterion's relevant stage. Tutor messages, invented IDs and unrelated-stage citations are rejected. Final corrected mastery is scored; assistance is disclosed separately. Incomplete sessions receive no final scorecard. Missing/unreliable evidence leaves accepted progress intact and requests a scoring retry. The rubric is formative and calibration remains pending.

## Verification commands and results

Logs and sanitized real-service evidence are under `docs/core-features-evidence-2026-10-28/`. Full checks are repeated after final review fixes; the final exit status and test count are recorded in the closing verification entry below.

| Command executed | Actual result |
|---|---|
| `npm run test -- --maxWorkers=2` (initial baseline) | PASS, 439 tests / 42 files. |
| `npm run test -- tests/unit/ai-learning.test.ts tests/unit/learning-policy.test.ts tests/unit/question-bank-import.test.ts --maxWorkers=2` | PASS, 87 tests / 3 files after adaptation changes. |
| `npm run test -- tests/unit/mathematical-diagnosis.test.ts tests/unit/ai-learning.test.ts --maxWorkers=2` | PASS, 96 tests / 2 files after arithmetic changes. |
| `npm run test -- tests/unit/ai-learning.test.ts tests/unit/question-bank-import.test.ts tests/unit/validated-curriculum.test.ts --maxWorkers=2` | PASS, 81 tests / 3 files after reasoning/evidence changes. |
| `npm run test -- tests/unit/method-references.test.ts tests/unit/mathematical-diagnosis.test.ts tests/unit/ai-learning.test.ts tests/unit/learning-policy.test.ts tests/unit/question-bank-import.test.ts tests/unit/validated-curriculum.test.ts --maxWorkers=2` | PASS, 135 tests / 6 files at that checkpoint; later negative cases are included in the final full suite. |
| `npm run typecheck` | PASS; contracts compilation and application type checking. Also executed by final `check`. |
| `npm run lint` | First run FAIL: 15 errors in pre-existing ignored local probe files and one unnecessary regex escape in the new checker. Fixed the escape and aligned backup-directory exclusion with Git; subsequent run PASS. Also executed by final `check`. |
| `npm run build` | PASS, production build. Existing React 18 and metadataBase warnings remain. Also executed by final `check`. |
| `npm run scan:bundle` | PASS: 47 browser assets, 12 markers and 357 private curated strings checked. Also executed by final `check`. |
| `node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json --verify` | PASS: real Firebase, 36 questions, 468 expected documents, 12 topics, zero missing documents/duplicates. Read-only. |
| `node --import tsx scripts/audit-core-features.ts --report=.local-backups/core-features-bank-audit.json` | PASS: real coverage table above; no excluded active questions. Read-only. |
| `npm run test:rules -- --deployed` | PASS: 63/63 Google Rules API simulator checks against deployed rules. No database-document writes. |
| `npm run test:rules -- --deployed --report=docs/core-features-evidence-2026-10-28/deployed-rules.json` | PASS: repeat retained with evidence file, 63/63. |
| `npm run ai:health` | PASS: HTTP 200, authenticated existing operator, Firestore connected, configured model present. Generation was not requested in this health check. |
| `node --conditions=react-server --import tsx scripts/probe-core-tutor.ts --free-tier-confirmed --case=understanding --report=.local-backups/core-features-live-understanding.json` | PASS isolated live provider/reference replay. |
| `node --conditions=react-server --import tsx scripts/probe-core-tutor.ts --free-tier-confirmed --case=arithmetic --report=.local-backups/core-features-live-arithmetic.json` | PASS isolated live provider/reference replay plus deterministic specific diagnosis. |
| `node --conditions=react-server --import tsx scripts/probe-core-tutor.ts --free-tier-confirmed --case=method_invalid --report=.local-backups/core-features-live-method.json` | PASS: invalid method rejected. |
| `node --conditions=react-server --import tsx scripts/probe-core-tutor.ts --free-tier-confirmed --case=method_alternative --report=.local-backups/core-features-live-alternative.json` | PASS: valid justified alternative accepted. |
| `node --import tsx scripts/verify-question-bank-session.ts --session=<existing DM-01-B01 browser session ID> --report=.local-backups/core-features-existing-session.json` | PASS, read-only historical persistence. The actual identifier was supplied from the existing browser URL; it is omitted here to avoid publishing a learner identifier. |
| `git diff --check` | PASS; line-ending conversion notices only. |

Focused arithmetic/uncertainty tests cover the known signed-squaring defect, chained equalities, operator precedence, equivalent fractions/percentages, unsupported symbols, quoted mistakes, rounding, modular arithmetic and separate math-field evidence. Solution security and score evidence checks are in `ai-learning.test.ts`, with API/authentication/storage boundaries in the retained backend test files. Rules simulation and bundle scanning are separate from these mocked service tests.

## Live integration boundaries

Four isolated Gemini checks used `gemini-3.5-flash-lite`, the real approved QM-07-B01 reference from Firebase, and normal shared quota reservations: the prior L1 understanding response, the L2 signed-square mistake, an invalid inverse-function justification, and a valid alternative mapping-table method. These are provider/reference integration checks, not newly completed learner sessions or proof of all-question acceptance.

Authenticated local backend health returned HTTP 200 with Firestore connected and AI configured. Its `structuredAiResponse:false` means generation was not requested by that health command; actual generation evidence comes from the four separate probes.

Read-only verification of the browser's existing DM-01-B01 session found submitted status, seven accepted gates, five response records, one matching 100/100 scorecard, one assistance event, committed statistics, and completed-session count four. This is historical persistence compatibility, not a fresh v2 scorecard or a new completed test.

The user explicitly authorized using the currently signed-in learner account. Its browser tab initially showed connection refused. The local build was started, but computer use then stopped because it could not determine the current browser URL with sufficient confidence. Browser interactions stopped; no alternate automation route, privileged student impersonation, history reset or fabricated session was used. Fresh browser progression, disclosure, score display, refresh and completion therefore remain **BLOCKED** until browser control is restored. The other 33 questions in the earlier matrix remain **NOT TESTED live**.

The operator probes only changed the existing shared quota counter. They did not create learner responses, scorecards, content, approvals or accounts. No new-schema learner write was performed in real Firestore during this run. The server's transactional persistence was tested with deterministic store fixtures, and existing real data was reread; those are distinct evidence classes.

## Compatibility, rollback and next steps

All data changes are additive: new diagnosis details, recommendation evidence, optional private source guidance and a solution-unlock event field. Workflow version 6 is retained. Old scorecards keep their rubric versions and stored scores; old reference snapshots are preserved. No destructive migration is required. Rolling back these source changes restores earlier behavior without deleting history; retain additive fields and the reviewed source/approval hashes.

1. Restore browser control and run the current build with the authorized learner, including an eligible Logic session, refresh/recovery, gated release and v2 scorecard persistence/display.
2. Author and independently validate the missing question depth within the approved curriculum. Use the existing approval/import workflow; do not activate generated candidates merely because they include solutions.
3. Run real strong/mixed/weak sequences with distinct eligible questions after bank expansion. The current 18/day and 4/minute shared limits require multiple quota windows for full-bank coverage; no limits were changed.
4. Have a mathematics instructor review reference applicability, difficulty assignments, diagnosis labels and the new criterion anchors. No instructor sign-off was fabricated.
5. Continue the 33 outstanding question workflows and retain FAIL/BLOCKED/NOT TESTED distinctions. Remote deployment needs separate authorization.

Build warnings concerning React 18 deprecation and the unresolved `metadataBase` are pre-existing compatibility/deployment follow-ups, not acceptance evidence.

## Final verification entry

**`npm run check` exited 0 on the final source:** `npm run typecheck`, `npm run lint`, `npm run test -- --maxWorkers=2`, `npm run build`, and `npm run scan:bundle` all passed. **496 tests passed, 0 failed, 45 files passed.** This is 57 additional tests relative to the 439-test baseline. The full captured output is `core-features-evidence-2026-10-28/automated-check.txt`. The focused feature files now contain 87 service tests, 25 arithmetic/uncertainty tests, 10 adaptive-policy tests, 4 method-reference tests, 4 bank-adapter tests and 8 curriculum tests; these are included in the 496, not additional to it.

Deployed-rule simulation passed **63/63**, and **4/4** isolated real Gemini/Firebase-reference probes passed. No full fresh browser workflow or v2 scorecard write/display check is counted as passed. The final local production server was restarted on `http://localhost:5173` for continuation. No remote application deployment was performed.

Legacy Spark client modules remain for historical/test compatibility. Current AI operations route to the server's policy, and deployed rules reject client-authored sessions/progress/scorecards. Existing dirty files outside the scoped changes were preserved; no commit, push or destructive migration was performed.
