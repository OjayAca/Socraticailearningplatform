# Individual question test matrix — 26–27 October 2026

No question is claimed to have passed all ten requested checks in this fresh regression run. Database/source fidelity and automated assignment cover all 36; those are not full live tutor tests. Each record uses its own protected source answer and semantic proof specification, not a generic numeric answer validator. No answer choices were supplied: all are constructed responses.

## Bank-wide coverage

| Question | Topic | Difficulty | Source/database and publication | Automated assignment/protected reference | Fresh live tutor result |
|---|---|---|---|---|---|
| DM-01-B01 | Speaking Mathematically | Basic | PASS | PASS | PASS live workflow across model versions; see model repair below |
| DM-01-I01 | Speaking Mathematically | Intermediate | PASS | PASS | NOT TESTED |
| DM-01-A01 | Speaking Mathematically | Advanced | PASS | PASS | NOT TESTED |
| DM-02-B01 | Set Theory | Basic | PASS | PASS | NOT TESTED |
| DM-02-I01 | Set Theory | Intermediate | PASS | PASS | NOT TESTED |
| DM-02-A01 | Set Theory | Advanced | PASS | PASS | NOT TESTED |
| DM-03-B01 | Relations and Functions | Basic | PASS | PASS | NOT TESTED |
| DM-03-I01 | Relations and Functions | Intermediate | PASS | PASS | NOT TESTED |
| DM-03-A01 | Relations and Functions | Advanced | PASS | PASS | NOT TESTED |
| DM-04-B01 | Logic | Basic | PASS | PASS | NOT TESTED |
| DM-04-I01 | Logic | Intermediate | PASS | PASS | NOT TESTED |
| DM-04-A01 | Logic | Advanced | PASS | PASS | NOT TESTED |
| DM-05-B01 | Combinatorics | Basic | PASS | PASS | NOT TESTED |
| DM-05-I01 | Combinatorics | Intermediate | PASS | PASS | NOT TESTED |
| DM-05-A01 | Combinatorics | Advanced | PASS | PASS | NOT TESTED |
| DM-06-B01 | Discrete Probability | Basic | PASS | PASS | NOT TESTED |
| DM-06-I01 | Discrete Probability | Intermediate | PASS | PASS | NOT TESTED |
| DM-06-A01 | Discrete Probability | Advanced | PASS | PASS | NOT TESTED |
| QM-07-B01 | Functions | Basic | PASS | PASS | FAIL (L1, L2); workflow completed |
| QM-07-I01 | Functions | Intermediate | PASS | PASS | NOT TESTED |
| QM-07-A01 | Functions | Advanced | PASS | PASS | NOT TESTED |
| QM-08-B01 | Descriptive Statistics | Basic | PASS | PASS | BLOCKED fresh replay; saved record PASS |
| QM-08-I01 | Descriptive Statistics | Intermediate | PASS | PASS | NOT TESTED |
| QM-08-A01 | Descriptive Statistics | Advanced | PASS | PASS | NOT TESTED |
| QM-09-B01 | Introduction to Probability | Basic | PASS | PASS | NOT TESTED |
| QM-09-I01 | Introduction to Probability | Intermediate | PASS | PASS | NOT TESTED |
| QM-09-A01 | Introduction to Probability | Advanced | PASS | PASS | NOT TESTED |
| QM-10-B01 | Probability Distributions | Basic | PASS | PASS | NOT TESTED |
| QM-10-I01 | Probability Distributions | Intermediate | PASS | PASS | NOT TESTED |
| QM-10-A01 | Probability Distributions | Advanced | PASS | PASS | NOT TESTED |
| QM-11-B01 | Introduction to Decision Making | Basic | PASS | PASS | NOT TESTED |
| QM-11-I01 | Introduction to Decision Making | Intermediate | PASS | PASS | NOT TESTED |
| QM-11-A01 | Introduction to Decision Making | Advanced | PASS | PASS | NOT TESTED |
| QM-12-B01 | Decision Analysis | Basic | PASS | PASS | NOT TESTED |
| QM-12-I01 | Decision Analysis | Intermediate | PASS | PASS | NOT TESTED |
| QM-12-A01 | Decision Analysis | Advanced | PASS | PASS | NOT TESTED |

## Required checks and current limits

For all 33 questions other than QM-07-B01, QM-08-B01 and DM-01-B01, checks 1–9 (browser display, actual-format validation, correct/incorrect evaluation, diagnosis, hints, gating, score/feedback accuracy, submission and refresh/interruption persistence) are NOT TESTED live. Check 10 (approved database record/source fidelity) is PASS. Automated assignment checks verify original question/reference and initially unreleased solution for all 36, but are not live browser tests.

QM-08-B01: prior complete live acceptance remains in QUESTION_BANK_INTEGRATION_2026-10-25.md. Its submitted record was reread on October 26: question and pinned reference match, seven accepted gates, five responses, one matching scorecard, total 100, one assistance event, statistics committed. Checks 8 and 10 pass for the saved record. A fresh 1–7 and 9 replay is BLOCKED by the existing non-repeating assignment rule; do not reset history to bypass it. A separate authorized eligible learner or approved replay workflow is needed for fresh interaction coverage.

QM-07-B01: correct question, instructions, notation and lack of choices displayed (1 PASS). The tutor accepted a second equivalent understanding answer and the justified finite-enumeration method, then rejected intentionally wrong signed squaring (validation exercised, but 2–4 FAIL/partial due to L1/L2 below). Solution remained inaccessible at 50% (6 PASS for pre-release boundary). The session and conversation survived overnight server/browser interruption and resumed at the saved stage (9 PASS for in-progress recovery). Source and pinned reference match (10 PASS). Hint, correction, final score and submission outcomes are recorded below as they complete; they are not implied by this partial result.

## Reproducible live findings

**L1 — valid understanding not assessed (FAIL, medium severity).** On QM-07-B01 at the understanding stage, submit: “We must find the image of the subset {-2,0,1}, the preimage of {1,4}, and decide injectivity and surjectivity. The domain is {-2,-1,0,1,2}, the declared codomain is {0,1,4}, and f(x)=x². Preimage means all domain elements whose outputs lie in the given set, not an inverse function.” Expected: assess the stated goal/givens as answer evidence. Actual: “I could not reliably assess that as an answer...” with no response assessment record or advancement. A second equivalent declarative explanation was accepted. The exact fallback in LearningService is reached when both provider classifications remain non-answer after the existing bounded reassessment. This establishes observed inconsistent provider intent classification; it does not prove a deterministic source-code defect. No acceptance gate was bypassed to hide it.

**L2 — concrete arithmetic error receives generic clarification (FAIL, medium severity).** At computation submit f(-2)=-4 and f(-1)=-1, image {-4,0,1}, preimage {1,2}, and claim injectivity because all five outputs differ. Expected: reject and identify the squaring/sign or resulting logic error. Actual: rejected as needs_revision but diagnosis category none, with generic “I'd like to understand your reasoning more clearly...” rather than a specific misconception. Gating remained safe. The semantic proof contract has no deterministic numerical check, and the provider did not produce a confident specific diagnosis. Preserve uncertainty rather than inventing a diagnosis; further tutor-quality remediation and live retesting remain required.

## Capacity and execution

Authorized account: the existing student account named by the user in this chat. No fresh account or privileged token was created. The configured shared limit is 18 reservations/day and 4/minute. A minimum ordinary session costs opening, four stage assessments and scoring (six reservations); wrong answers, hints, intent reassessments and retries add calls. Thus 36 complete sessions require at least 216 reservations before negative/hint tests. Multiple quota windows and an eligible account for non-repeating questions are required. No limit was changed and no automatic future run has been scheduled.

## Live completion update — 27 October

QM-07-B01 completed the normal workflow on the authorized account. After the recorded failures L1/L2, the stage-appropriate hint did not reveal the answer, corrected set calculations were accepted, and interpretation completed all seven internal gates. Only then did the solution and scorecard unlock. The released final answer matches the actual source. Four criteria scored 25 each, total 100, with one assistance event; evidence references the corrected computation, justified method and contextual interpretation, consistent with final-mastery scoring. Calibration remains pending.

Finish session persisted a submitted record, five assessed responses (including the rejected computation), one matching scorecard and committed statistics. Completed-session count increased from 2 to 3, preserving prior history. Database verification: security-evidence-2026-10-26/functions-final-2026-10-27.json. Checks 1, 5, 6, 8, 9 and 10 PASS; score arithmetic, source solution and evidence alignment PASS within check 7, with academic calibration unverified. Checks 2–4 retain the L1/L2 failures despite successful recovery. Overall question status remains FAIL, not a clean pass.



## DM-01-B01 continuation — 27 October

The browser displayed the actual integer-domain set-builder question, strict lower bound, inclusive upper bound, even-number definition and constructed-response instructions correctly. Understanding and justified enumeration were accepted. Deliberately omitting 4 because of an incorrect interpretation of the inclusive upper bound was rejected as incorrect_interpretation; the tutor specifically requested re-evaluation of the upper bound without revealing the answer. Saved evidence (set-builder-before.json) confirms three assessed responses, computation needs_revision, subsequent gates locked, no solution or scorecard, and previously completed progress still 3.

Browser reconnection succeeded. The first hint attempt reported an unreachable local server; it did not record assistance. The stopped local server was restarted as a hidden background process using the existing build and credential mechanism, and the preserved session was reloaded. This is an infrastructure interruption, not a new question or reset.

The quota uses America/Los_Angeles calendar days, not Manila calendar days. At 11:38 AM Manila October 27, the stored day was October 26 with 15 of 18 reservations consumed. The next reset is 3:00 PM Manila October 27. Full-bank live completion remains blocked by quota and existing non-repeating assignment eligibility.

## Verified stopping point — 27 October, 11:42 AM Manila

DM-01-B01 is **BLOCKED**, not fully passed. The hint stayed at computation and disclosed no final answer. Corrected roster {-2,0,2,4}, zero membership and boundary reasoning were accepted. The attempted final interpretation returned HTTP 429 because the shared allowance reached 18/18; no gate was advanced by that rejected request.

Read-only `set-builder-quota-blocked.json` confirms 75% stage progress: six internal gates accepted, result_interpretation pending, four assessed responses including the earlier incorrect_interpretation, supportUsage 1, solutionReleased false, no scorecard, statsCommitted false, and completed-session count still 3. The question text and pinned reference match the approved records. Accepted progress survived the real local-server interruption. Screenshot: `security-evidence-2026-10-26/set-builder-quota-blocked.png`.

Check status: 1 display PASS; 2 actual semantic format PASS for executed stages; 3 correct/incorrect assessment PASS for executed stages, final interpretation BLOCKED; 4 error diagnosis PASS; 5 hint PASS; 6 pre-release gating PASS, eventual release BLOCKED; 7 score/explanation BLOCKED; 8 final submission BLOCKED (four intermediate assessments persisted); 9 in-progress interruption recovery PASS, submitted recovery BLOCKED; 10 source/publication PASS. Overall remains BLOCKED because the required workflow is incomplete.

Next action: after the configured reset at **3:00 PM Manila on October 27**, resume this same session from learning history. Submit the interpretation still shown in the input, verify acceptance, request the solution/scorecard, compare against the protected source and four criterion scores, finish once, refresh, then verify persisted scorecard and progress. Do not start a replacement session or reset history. Normal additional AI reservations remain subject to the existing shared limits. No automation or deployment was scheduled.

Current fresh-run coverage: QM-07-B01 completed with FAIL findings L1/L2; DM-01-B01 BLOCKED at 75%; QM-08-B01 saved submission rechecked but fresh replay BLOCKED by non-repeating assignment; the other 33 questions remain NOT TESTED live. All 36 have passing source/database and automated assignment coverage. No full-bank live pass is claimed.

## Evening continuation — October 27, 10:10–10:13 PM Manila

The reset-time next action was attempted. The restored browser tab initially had ERR_CONNECTION_REFUSED; restarting the existing local production build restored the same authenticated session, history, and 75% progress. Two normal UI submissions of the saved interpretation both reached Gemini, which returned HTTP 404 / NOT_FOUND. The app returned HTTP 503 / ai-provider-404 and restored the draft. These requests were not blocked by the daily quota. No accepted response, released solution, scorecard, or completion was produced.

`npm run ai:health` (without generation probe) passed HTTP 200: authenticated, Firestore connected, privacy configured, AI enabled, model gemini-2.5-flash-lite. Read-only Google models.get and models.list returned HTTP 200 and listed that model with generateContent support. Metadata availability does not establish successful generation; the precise provider-side cause remains unresolved. This is not evidence of Google quota exhaustion. Neither key rotation nor model change was performed.

Post-failure read-only session verification confirmed original question/reference match, six accepted gates, interpretation pending, four assessed responses, one support event, no solution/card/statistics commit, completed-session count 3. Evidence: security-evidence-2026-10-26/set-builder-evening-resume.json, set-builder-provider-blocked.json, model-availability-evening.json, provider-blocker-evening.json and set-builder-provider-blocked.png in the same directory.

DM-01-B01 remains BLOCKED; other question coverage is unchanged. No application code, questions, security configuration, quota limit or deployment changed. Only reports and ignored diagnostic helpers were added. Next action: resolve generation access for the configured Google project/model, then resume this same checkpoint. A new API key is not an established remedy.

## Model repair — October 27, 10:36 PM Manila

The exact generation error confirmed that the old model is unavailable to new users. Local configuration now uses Google's recommended gemini-3.5-flash-lite with the existing key; a structured probe and the saved DM-01-B01 interpretation/scorecard succeeded. The earlier provider blocker is RESOLVED locally. All gates accepted, source-matching answer released, one 100/100 scorecard with assistance 1 saved, status submitted, completed count 3 -> 4. See GEMINI_MODEL_FIX_2026-10-27.md and set-builder-model-fixed.json/png. DM-01-B01 live workflow is PASS across the two model versions; this is not full-bank validation of the new model. Other matrix results remain unchanged. No remote deployment.

## Core-feature remediation — 28 October

See `CORE_FEATURES_COMPLETION_2026-10-28.md` and `CORE_FEATURES_TEST_MATRIX_2026-10-28.md`. L1's exact understanding response passed an isolated live Gemini replay using the real approved Firebase reference. L2's exact signed-square error now receives a deterministic, specific corrective question, and the live provider also identified the error. Invalid inverse-function justification was rejected and a valid mapping-table alternative accepted in two additional provider checks. All four used the configured model and shared quota; none created learner-session or score records.

These results do not overwrite the earlier browser failures or establish fresh all-question acceptance. Computer use stopped because it could not determine the browser URL reliably. Fresh browser stages, solution release, v2 scorecard display/persistence and refresh remain BLOCKED. The existing DM-01-B01 submitted record was reread successfully with matching source/reference, seven accepted gates, one matching scorecard and committed statistics. The other 33 questions remain NOT TESTED live. No remote deployment, new question publication or history reset occurred.
