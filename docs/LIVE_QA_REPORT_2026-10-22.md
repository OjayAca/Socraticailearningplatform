# MINDGUIDE live baseline QA report

Testing performed 18–19 October 2026; persistence/expiry follow-up and report finalized 22 October 2026 (Asia/Manila).

## Executive summary and verdict

**FAIL — the system is partially functioning, but the learning workflow is not yet reliable.** Real student and administrator browser interactions were executed. The mean tutor accepted the substance of correct responses in its dialogue without consistently completing the corresponding checkpoint. At Interpretation, two complete answers received success messages while the session stayed at 75%, preventing solution release and scorecard generation.

Navigation, custom-problem opening, arithmetic-error correction, incomplete history persistence, student/admin route separation, administrator authentication, test-account status enforcement, draft reference versioning, and report previews worked in the tested cases. This is not a claim that every feature passed.

Prepared practice was unavailable because no approved question with matching scoring references was available. Logic continuation repeatedly hit the shared free AI allowance. These are configuration/resource blockers, not proof that the corresponding features are absent. Adaptive strong/weak sequences, complete scorecard evaluation, and completed-session persistence could not be established.

No application code was changed. No Firebase project was switched, emulator used, demo database seeded, or approval manufactured. The earlier file QA_BASELINE_2026-10-18.md records a separate blocked attempt and is retained unchanged; this report describes the subsequent authorized live testing.

## Environment, authorization, and retained test data

- Local Next.js 16.3.6 app, npm run dev, http://localhost:5173, existing .env and .env.local.
- Computer Use was the primary interaction method: in-app browser for student flows and Brave for administrator flows. Source inspection supported diagnosis and expected-rule analysis only.
- User explicitly confirmed that Orvin Jay Acasio was a dedicated test account and that the configured Firebase project could receive test data. Administrator access was subsequently supplied. Credentials are omitted from artifacts.
- Two dedicated learning sessions were created:
  - Mean: MTFad2RDfAWnnCIHnpeUSBPX3pg2_8ff4968a-3990-4c4c-8991-0580a4efc163.
  - Logic: MTFad2RDfAWnnCIHnpeUSBPX3pg2_e9244d7d-cf82-480d-b43d-bb35e35ed523.
- The dedicated learner was deactivated, verified unable to load a session, then restored through Suspend → Activate. Restoration was verified as Active; later student history loaded successfully.
- A dedicated formula reference, qa-baseline-20261018-mean-reference, was created as draft, edited to version 2, and archived. It was never approved or assigned to learners.
- The permanent-delete dialog was inspected and cancelled. No permanent deletion, real student edit, role change, or external Firebase Console change was performed.
- The development server was restarted after interruptions. On 22 October the mean session was expired; this prevented resuming the old checkpoint but does not invalidate the recorded 18 October failure.
- Student fresh-login credentials were not supplied. Existing student authentication persistence was verified; an explicit student logout/login cycle was not.

## Test statistics

There are **48 recorded cases**: **31 PASS**, **6 FAIL**, **10 BLOCKED**, and **1 NOT IMPLEMENTED**.

**37 cases reached an executed pass/fail determination.** Blocked cases include both attempted operations stopped by a blocker and dependent scenarios not executable; they are not counted as passed or completed executions. The not-implemented item is the narrow administrator academic-profile editing operation, not the whole user-management feature.

Confirmed distinct defects: **5** — **0 Critical, 1 High, 2 Medium, 2 Low**. Two failed cases map to the same High defect. No numerical score was invented and no completed learning session was claimed.

## Core feature assessment

| Feature | Result | Evidence and limits |
|---|---|---|
| Authentication and student dashboard | Partial; tested controls PASS | Existing student session, navigation, restart persistence and admin login worked. Fresh student login cycle BLOCKED. |
| Step-by-Step Socratic Solver | FAIL | Useful dialogue and correction, but acknowledgment and checkpoint progression disagree. Logic completion quota-blocked. |
| Formula and Theorem Justification | Partial | Mean invalid/vague explanations did not advance; valid equal-weighting explanation advanced. Theorem-specific cases unexecuted. |
| Error Diagnosis and Misconception Detection | Partial | Specific division error identified. Wrong-formula responses initially received generic clarification; later feedback distinguished range and mean. Invalid-logic/theorem diagnosis blocked. |
| Adaptive Difficulty Management | BLOCKED | Implemented recommendation rules found; neither required completed performance sequence could be established. |
| Progressive Solution Unlocking | FAIL | Direct-navigation bypass was denied and persisted stages stayed gated, but correct final reasoning did not unlock completion; hint targeted wrong stage. |
| Critical Thinking Scorecard | BLOCKED / expiry message FAIL | Could not generate or validate scorecard; expired incomplete record misleadingly claims one is saved. |
| Learning Progress and History | Partial | Incomplete records persisted without duplicate list entries through refresh/restart. Completed-scorecard persistence and fresh-login retrieval blocked. |
| Administrator Account Management | FAIL with working operations | Login, search, details, deactivation enforcement and restoration worked. Direct reactivation absent for deactivated account; profile editing not implemented in tested UI. |
| Learning Content Management | Partial | Draft reference create/edit/version/persistence/archive worked; deletion cancellation worked. Prepared bank empty; other content CRUD not exhaustively tested. |
| Reports and Analytics | Partial | Progress empty state, known-session Activity preview and print page worked. CSV file delivery unverified; audit page contains inaccurate AI description. |

## Test results table

Evidence filenames below are in [qa-evidence-2026-10-18-live](qa-evidence-2026-10-18-live/). “Browser observation” refers to the recorded Computer Use outputs in this chat, not an invented screenshot.

| Test ID | Feature | Action Performed | Expected Result | Actual Result | Status | Evidence |
|---|---|---|---|---|---|---|
| A01 | Student dashboard | Opened authenticated dashboard and Start session | Dashboard and session setup load | Dashboard metrics, history link, and setup loaded | PASS | Browser observations, 18 Oct |
| A02 | Subject navigation | Selected Quantitative Methods, Discrete Mathematics and expanded subtopics | Matching topics and subtopics appear | Subject lists switched; subtopics expanded | PASS | Browser observations, 18 Oct |
| A03 | Student authentication | Used existing signed-in account; restarted browser/server | Existing authentication persists | Authorized student history loaded again on 19 and 22 Oct | PASS | history-after-restart.txt; browser 22 Oct |
| A04 | Fresh student login | No student password supplied; used existing session | Fresh logout/login verifies saved learning records | Fresh student login and logout/login cycle not executed | BLOCKED | Only administrator credentials supplied |
| B01 | Custom mean input | Submitted original narrative problem | Supported syntax starts; unsupported syntax has clear error | Narrative rejected with format guidance; supported equivalent accepted | PASS | Browser observations; mean-conversation.txt |
| B02 | Socratic opening | Started 'Find the mean of 4, 6, and 8.' | Reasoning question without full answer | Asked to identify numbers and count; no final solution | PASS | mean-conversation.txt |
| B03 | Empty response | Inspected empty composer and send control | Empty message cannot submit | Send disabled with empty response | PASS | mean-stuck-at-75.txt |
| B04 | Irrelevant response | Submitted 'I like blue bicycles.' | Redirect to relevant reasoning; no progression | Asked for givens and count; stayed at 0% | PASS | mean-conversation.txt |
| B05 | Partial response | Submitted 'The values are 4 and 6.' | Require complete understanding | Requested goal/givens; no progression, but feedback was generic | PASS | mean-conversation.txt |
| B06 | Correct understanding | Submitted goal, all values, and count in mean and Logic sessions | Acknowledgment and stage progression agree | Tutor praised understanding and asked next-stage question while staying at 0% | FAIL — HIGH | BUG-01; mean-conversation.txt; browser Logic observation |
| B07 | Custom Logic session | Started 'Evaluate p AND q when p=true and q=false.' | Session opens with reasoning prompt | Session opened; transient concurrent-request rejection cleared on retry | PASS | logic-quota-blocker.txt |
| B08 | Logic completion | Submitted complete Boolean understanding; retried after cooldown | Can continue through method, computation, interpretation | Repeated shared free AI allowance errors prevented continuation | BLOCKED | logic-quota-blocker.txt |
| C01 | Invalid justification | Submitted correct mean formula with range-based explanation | Do not accept invalid explanation | Stayed at Method Selection; requested explanation | PASS | mean-stuck-at-75.txt |
| C02 | Wrong formula | Submitted maximum minus minimum at method stage | Reject wrong method | Did not advance; generic clarification rather than specific diagnosis | PASS | admin-mean-review.txt |
| C03 | Vague explanation | Submitted 'Use sum divided by count because it applies.' | Require why formula fits givens | Explained range versus mean and asked why total/count applies | PASS | mean-stuck-at-75.txt |
| C04 | Valid justification | Explained equal weighting, total, count and equal shares | Advance to computation | Advanced from 25% to 50% | PASS | mean-stuck-at-75.txt |
| D01 | Computational error | Submitted '(4 + 6 + 8) / 3 = 8.' | Identify division mistake without accepting answer | Asked to recheck division and compute 18/3; stage stayed open | PASS | mean-error-diagnosis.txt; mean-stuck-at-75.txt |
| D02 | Bare correct answer | Submitted '6' after division correction | Evaluate using preceding work | Advanced to Interpretation at 75%; prior method was already explained | PASS | mean-stuck-at-75.txt |
| D03 | Invalid logic/theorem | Planned invalid Boolean rule and theorem cases | Specific corrective diagnosis | Could not reach Logic method/computation due to quota; theorem case not executed | BLOCKED | logic-quota-blocker.txt |
| E01 | Adaptive strong sequence | Inspected current rules and attempted completion prerequisites | Compare recommendations after sufficient completed sessions | No completed sessions; could not establish strong-performance sequence | BLOCKED | server/gemini.ts recommendation; BUG-01; quota |
| E02 | Adaptive weak sequence | Submitted weak/incorrect work; inspected recommendation prerequisites | Compare weak sequence with strong sequence | Guidance observed, but no completed weak sequence or difficulty change verified | BLOCKED | mean-stuck-at-75.txt; quota |
| F01 | Direct navigation bypass | Opened existing mean session /confirmation URL at 75% | Return to current gated stage without final solution | Redirected to /learn at Interpretation 75% | PASS | Browser observation; wrong-stage-hint.txt |
| F02 | Refresh persistence | Reloaded session and inspected checkpoints/conversation | Preserve accepted stages and lock remaining stages | Preserved 0% and later 75% states and conversation | PASS | mean-stuck-at-75.txt |
| F03 | Hint relevance | Clicked I need a hint during Interpretation | Hint targets interpretation without granting completion | Hint repeated method praise and asked 'What is 4 + 6 + 8?' | FAIL — MEDIUM | BUG-02; wrong-stage-hint.txt/.jpg |
| F04 | Final checkpoint | Submitted two complete interpretations with verification | Complete interpretation and expose solution/scorecard action | Tutor said task successfully interpreted, but remained at 75%; no completion action | FAIL — HIGH | BUG-01; mean-stuck-at-75.txt/.jpg |
| G01 | Scorecard generation and validity | Tried to finish mean session | Generate evidence-linked rubric score and released solution | Final checkpoint did not complete, so generation could not be tested | BLOCKED | BUG-01 |
| G02 | Scorecard retrieval | Checked student history and admin learner details | Reopen saved completed scorecard | No completed scorecard existed; retrieval/score consistency untested | BLOCKED | activity-print.txt; history-after-restart.txt |
| H01 | Incomplete history | Opened history, refreshed, reopened after restart | One record per created session; incomplete work not counted completed | Two distinct incomplete records remained; completed count stayed zero | PASS | history-after-restart.txt; activity-print.txt |
| H02 | Completed progress persistence | Attempted prerequisites for completed history and scorecard | Completion totals and scorecard persist through login | No completed session; fresh student login also unavailable | BLOCKED | BUG-01; A04 |
| I01 | Administrator login | Signed in with supplied administrator credentials | Administrator dashboard loads | Dashboard and navigation loaded | PASS | Browser observation, 18 Oct |
| I02 | Student role restriction | Entered /admin/users and /admin/reports as student | Deny administrator access | Both redirected to student dashboard; no admin data shown | PASS | Browser observations, 18 Oct; UI-level test only |
| I03 | User search/details | Searched authorized learner; opened learner progress detail and session review | Correct account and learning records shown | Matched authorized learner and both known sessions | PASS | admin-mean-review.txt |
| I04 | Account deactivation | Deactivated authorized test account, reloaded student session | Account inactive; learning access denied | Status Deactivated; 'Your account is not active.' | PASS | deactivated-account.txt; browser student error |
| I05 | Direct account reactivation | Inspected controls for deactivated test account | Direct Activate available | Only Suspend remained; needed Suspend then Activate | FAIL — MEDIUM | BUG-03; deactivated-account.txt |
| I06 | Account restoration | Suspended then activated same test account | Original active status restored | Activate succeeded; later student history accessible | PASS | account-restored.txt/.jpg; history-after-restart.txt |
| I07 | Admin academic-profile editing | Inspected users and learner-detail UI; checked implementation | Edit permitted academic profile fields if supported | No academic-profile edit control; implemented account actions manage status only | NOT IMPLEMENTED | SecureAdminUsers in src/app/components/SecureAdmin.tsx; user table |
| J01 | Content navigation | Opened problem, formula, subject and topic management; expanded curriculum | Editors and fixed curriculum accessible | Editors loaded; curriculum subtopics expanded | PASS | admin-draft-archived.txt; browser observations |
| J02 | Prepared content availability | Requested prepared Logic practice; inspected admin availability | Approved matching problem available to assign | No unanswered approved question; admin showed 0 questions and 0/36 coverage | BLOCKED | Browser observations; admin-draft-archived.txt |
| J03 | Draft creation/persistence | Saved dedicated draft formula reference; refreshed and reopened | Stored fields persist | Version 1 draft and entered fields restored | PASS | Browser observations; admin-draft-archived.txt |
| J04 | Draft editing/versioning | Added equivalent notation and saved | New version retains change | Version 2 draft displayed | PASS | admin-draft-archived.txt |
| J05 | Deletion confirmation | Opened delete dialog then cancelled | Confirmation required; cancel preserves entry | Final delete disabled until required fields; cancellation preserved draft | PASS | Browser observation; no permanent deletion performed |
| J06 | Draft archival | Archived dedicated QA reference | Archive without affecting approved curriculum | Version 2 archived; delete control removed | PASS | admin-draft-archived.txt/.jpg |
| K01 | Progress report | Previewed Learning progress with no completions | No completed progress rows | 0 of 0 rows | PASS | Browser observation, 18 Oct |
| K02 | Activity report | Generated Activity preview and compared known records | Exactly known sessions with correct subjects/statuses | 2 of 2; mean at result_interpretation, Logic at problem_understanding | PASS | activity-print.txt |
| K03 | Print report | Clicked Open print report | Printable report matches preview | Print page contained both matching pseudonymized rows | PASS | activity-print.txt; native print/PDF save not executed |
| K04 | CSV export | Clicked Export CSV, waited for download, checked available evidence | CSV file downloads with expected rows | Export audit event exists; browser download event timed out; file not verified | BLOCKED | admin-audit.txt; 15-second download timeout |
| K05 | Audit accuracy | Opened Audit & AI and compared live workflow | Accurate current AI operational description | Page claims current engine does not call live AI despite live Gemini workflow | FAIL — LOW | BUG-04; admin-audit.txt; server/gemini.ts |
| G03 | Incomplete-session expiry message | Reopened unfinished mean session on 22 Oct | Explain expiry without claiming nonexistent scorecard | Expired session says reasoning record and scorecard are saved, although no scorecard was generated | FAIL — LOW | BUG-05; expired-session.txt/.jpg; SecureSession.tsx:282 |

## Confirmed defects

### BUG-01 — Tutor acknowledgment and checkpoint completion disagree
**Severity: HIGH. Affects solver, progressive unlocking, scorecard access.**

Reproduction on the mean session:
1. Select Quantitative Methods → Descriptive Statistics → My own problem.
2. Start “Find the mean of 4, 6, and 8.”
3. Submit “We need the arithmetic mean. The given values are 4, 6, and 8, and there are three values. The mean represents their average.”
4. Observe praise and a request for the formula while the stage stays Problem Understanding at 0%.
5. Continue with the valid equal-weighting explanations recorded in the transcript; reach Computation, submit the intentional error, then correct it to 6.
6. At Interpretation submit “The mean is 6. If the total of 18 were shared equally among the three observations, each would be 6. This lies between 4 and 8, and 6 times 3 equals 18, which verifies the total.”
7. Submit the second complete interpretation in the transcript when the first does not advance.

**Expected:** Sufficient correct current-stage reasoning completes the checkpoint, and the dialogue accurately describes the resulting state. After the final stage the solution/scorecard action becomes available.
**Actual:** Both final answers received “successfully found the mean and interpreted its meaning” and an offer to try another problem, while the UI remained Interpretation 75%. No completion control appeared. The same acknowledgment-without-progression pattern occurred at the initial Logic understanding stage. The mean case is not a claim of permanent deadlock under every possible response: some earlier stages advanced after extra explanation.

**Evidence:** [Final checkpoint transcript](qa-evidence-2026-10-18-live/mean-stuck-at-75.txt), [screenshot](qa-evidence-2026-10-18-live/mean-stuck-at-75.jpg), [administrator response review](qa-evidence-2026-10-18-live/admin-mean-review.txt). No visible exception accompanied the two final replies.

**Likely root cause — suspected:** The AI turn's intent/accepted fields can disagree with the feedback. LearningService.ts assesses an answer only when input intent and model turn intent are both answer. The admin review omitted the praised final interpretations from assessed-response rows, consistent with them being treated as non-answer turns. Raw provider output was not captured, so the exact model classification is unconfirmed.

**Recommended fix:** Validate dialogue intent and acceptance consistently against current-stage evidence, prevent next-stage/completion wording when a stage remains open, and add integration cases for concise correct understanding and final interpretation. Do not bypass gates or auto-accept merely because feedback is positive.

### BUG-02 — Interpretation hint asks for an already completed computation
**Severity: MEDIUM. Affects Socratic support.**

1. Reach Interpretation 75% on the mean problem after answering 6.
2. Click “I need a hint.”
3. Inspect the reply and expanded Support history.

**Expected:** A hint about interpreting the mean in context.
**Actual:** The hint repeats prior method praise, asks to calculate the mean, then asks “What is 4 + 6 + 8?” Support history labels it Interpret the Result. The checkpoint did not incorrectly advance.

**Evidence:** [Transcript](qa-evidence-2026-10-18-live/wrong-stage-hint.txt), [screenshot](qa-evidence-2026-10-18-live/wrong-stage-hint.jpg).
**Root cause — suspected:** Generated assistance is not sufficiently constrained/validated against currentStage and already accepted evidence. No provider error was visible.
**Recommended fix:** Validate hint stage relevance, avoid repeating completed questions, and test hint generation at each stage after corrective dialogue.

### BUG-03 — Deactivated account has no direct Activate action
**Severity: MEDIUM. Affects administrator account management.**

1. Search the dedicated learner in Users.
2. Supply an audit reason and click Deactivate.
3. Inspect its actions after status changes to Deactivated.
4. To restore the tested account, click Suspend; then click Activate.

**Expected:** A clear direct way to restore a deactivated account to its previous active access.
**Actual:** Deactivated row showed only Suspend. The indirect Suspend → Activate sequence restored it.

**Evidence:** [Deactivated row](qa-evidence-2026-10-18-live/deactivated-account.txt), [restored row](qa-evidence-2026-10-18-live/account-restored.txt).
**Root cause — confirmed in source:** SecureAdmin.tsx:529–530 renders Activate only when status is suspended; every other status uses Suspend.
**Recommended fix:** Define and expose allowed lifecycle transitions explicitly, including direct reactivation where supported, with audit reasons and suitable confirmation. Restoration in this run is complete.

### BUG-04 — Audit page incorrectly says no live AI is used
**Severity: LOW. Affects operational administration.**

1. Sign in as administrator.
2. Open Audit & AI.
3. Read the page description.

**Expected:** Description consistent with the current Gemini-backed learning engine.
**Actual:** It says “The current practice engine does not call a live AI service.”

**Evidence:** [Audit page transcript](qa-evidence-2026-10-18-live/admin-audit.txt).
**Root cause — confirmed:** Stale literal text at SecureAdmin.tsx:1120; server/gemini.ts implements live generateContent calls and the tested sessions returned AI dialogue.
**Recommended fix:** Update the description and clarify which current failures/quotas are actually represented by the available logs. Do not claim the absence of logging solely from this wording.

### BUG-05 — Expired incomplete session claims its scorecard is saved
**Severity: LOW. Affects incomplete-session messaging.**

1. Leave an uncompleted session without generating a scorecard.
2. Reopen it after inactivity expiry (observed 22 October for the mean session).
3. Read the expiry screen.

**Expected:** State that the reasoning record is preserved, and accurately explain whether any scorecard exists.
**Actual:** “Your practice reasoning record and scorecard are saved.” No scorecard was generated during this test.

**Evidence:** [Expiry transcript](qa-evidence-2026-10-18-live/expired-session.txt), [screenshot](qa-evidence-2026-10-18-live/expired-session.jpg).
**Root cause — confirmed:** SecureSession.tsx:282–284 uses one unconditional success message for submitted, reviewed, returned, abandoned and expired statuses.
**Recommended fix:** Render status-specific text and condition the scorecard claim on the presence of a saved scorecard.

## Blockers, limitations, and suspected issues

- **Prepared content:** Administrator availability displayed 0 approved questions with matching scoring material and 0/36 topic/difficulty coverage. No sample approval or seeded workaround was used.
- **AI allowance:** Logic answer retries produced “The shared free AI allowance is in use. Your work is preserved; try again later.” Multiple attempts, including after other admin work, did not recover. Source confirms a shared quota guard checks RPM/TPM/RPD; which quota was exhausted was not established. Limits were not changed.
- **Concurrency:** An initial custom Logic start overlapped a mean request and returned “Another request is still processing.” Sequential retry succeeded. This was treated as recoverable locking behavior, not a confirmed defect.
- **CSV — suspected delivery problem, not a confirmed bug:** Export was clicked; the audit log recorded it. The browser download event timed out after 15 seconds, and no CSV was found in the checked default Downloads directory. Browser download settings or tooling may explain this. File contents and delivery need an independent browser retest.
- **Exact natural-language problem:** The long narrative was rejected, but the UI advertised constrained formats and an equivalent supported mean command worked. Recorded as a limitation, not a confirmed mathematical parsing defect.
- **Scoring expectations:** Current server rubric uses four 0–25 dimensions: accuracy, logical validity, method selection, explanation quality, with evidence IDs and pending calibration. A separate reasoning-quality dimension is not shown by that schema. No scorecard was generated, so scores and evidence correspondence remain unverified.
- **Adaptation expectations:** Current server recommendation requires at least three completed AI sessions; it considers up to five, accuracy and reasoning averages, and strong-hint dependence. Low accuracy/reasoning can lower difficulty; both at least 80% with mostly independent work can raise it. Source inspection establishes intended rules only, not a test pass.
- **Coverage:** No arbitrary data access, API authorization penetration test, complete subject/topic/problem/prompt CRUD matrix, actual permanent deletion, native PDF save, invalid-theorem session, or completed-scorecard lifecycle was executed. Fixed curriculum management was inspected; the dedicated formula draft was the reversible content mutation.
- **Environment:** Restarts caused initial compilation delays and browser reconnection failures. They are not labeled application regressions. The mean record later expired; resumption of the old work is therefore blocked. New-session regression testing is required after fixes.

## Recommended next actions

1. Fix BUG-01 before accepting the core learner workflow. Reproduce the recorded mean dialogue, complete all four stages, generate the scorecard, finish the session, reopen it, and verify dashboard/history totals.
2. Fix wrong-stage hints and test incorrect formulas, invalid explanations, arithmetic mistakes and irrelevant text at the actual relevant checkpoints.
3. Have an authorized academic reviewer supply genuinely approved prepared content and verify its scoring references. Restore sufficient legitimate AI test capacity without bypassing quota controls.
4. Run separate strong/weak sequences meeting the three-completed-session threshold; verify both recommendations and actual next assignments against available content.
5. Fix direct account reactivation and inaccurate administrative/expiry text. Retest account restoration and inactive-account enforcement.
6. Recheck CSV delivery and content in a normal browser, then compare completed scorecards and filtered/exported reports against known test records.
7. Complete the fresh student logout/login persistence test using authorized credentials.

The high-severity completion failure is sufficient for **FAIL**, despite blocked coverage elsewhere. This report does not claim that scorecard mathematics, adaptive difficulty, or full administrator CRUD were proven broken; those still require execution once their prerequisites are available.

