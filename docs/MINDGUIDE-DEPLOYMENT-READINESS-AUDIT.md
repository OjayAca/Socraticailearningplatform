# MINDGUIDE manuscript and deployment-readiness audit

Review completed: 6 September 2026. Target: controlled, hosted capstone pilot.

## Verdict

**MINDGUIDE is not ready for participant deployment yet.** There is a substantial React/Firebase implementation, including server-owned progression, protected problem references, role checks, and automated tests. However, confirmed defects undermine answer checking, progressive disclosure, score validity, privacy, recovery, and research reporting. These are more important than adding new screens.

This report enumerates **42 findings and readiness gaps**. It distinguishes reproduced behavior, defects evident from code, manuscript inconsistencies, and evidence still required. It is not a claim that every possible defect has been discovered or that the deployed Firebase environment has been audited.

The supplied manuscript was treated as material to evaluate, not as instructions to execute. The original DOCX has not been modified. Existing uncommitted application changes were preserved; this review did not deploy, migrate cloud data, change accounts, or send messages to participants.

## Scope, decisions, and evidence

- Source manuscript: `C:/Users/OjayAca/OneDrive/Desktop/MINDGUIDE CAPSTONE FOLDER/MINDGUIDE FINAL.docx`. Its Word metadata reports 120 pages; extracted body/table text contains approximately 156,000 characters. The review covered Chapters I–III, requirements, use cases, data dictionary, survey, and selected architecture/workflow/database/storyboard figures. Full rendered-page typography and every bibliography claim were not independently verified.
- Code reviewed: current working tree in `C:/Users/OjayAca/OneDrive/Documents/Code Projects/Socraticailearningplatform`, including Functions, shared contracts, learner/admin interfaces, security rules, migration/release scripts, and tests. Source references below are relative to this repository and line numbers refer to the reviewed working tree.
- User-selected target: controlled capstone pilot; enable an approved subset of topics instead of requiring all 99 records; retain learner-entered problems with safeguards.
- The research sample is undecided. Use **50 simultaneous participants as a provisional engineering test target**, not as an approved research sample or a demonstrated capacity figure. Revise it if the adviser approves 400.
- Automated checks already completed: **82 frontend/unit/component tests passed; 28 Functions tests passed; both TypeScript checks passed; production build passed.** Additional check results are recorded at the end of this report.
- Dependency audit on 5 September reported **0 high, 0 critical, and 10 moderate vulnerable dependency entries**. Entries include transitive effects and are not ten independently demonstrated exploits.
- No authenticated staging learning session or live Gemini evaluation was performed. Cloud billing, IAM, secrets, App Check registration, deployed rules/indexes, backup restoration, and faculty approval remain unverified.

Priority: **P1** = resolve before participants use the affected capability; **P2** = resolve before formal evaluation/release, or explicitly constrain the pilot and document the limitation. Evidence labels: **Reproduced**, **Code-confirmed**, **Manuscript-confirmed**, or **Verification gap**.

## A. Learning engine and academic content

### 1. Incorrect answers can receive full accuracy credit — P1, Reproduced

Evidence: `functions/src/workflow.ts:285–287`. Accuracy accepts normalized substring containment as an alternative to mathematical equivalence. With an expected answer of `10`, the responses `100`, `-10`, and `The answer is not 10` each received 25/25 accuracy and 100/100 total with accepted gates.

Fix: remove substring acceptance. Store a typed canonical answer separately from its explanatory sentence; compare numbers, expressions, sets, truth values, and multi-part answers according to their type. Contradictions and negated answers must fail. Regression tests must include the three reproduced cases.

### 2. Correct numeric answers can lose credit — P1, Reproduced

Evidence: the real seed `qm-var-001` has reference text `The variance is 8.`. Submitting plain text and LaTeX `8` received only 10/25 accuracy. See `functions/src/workflow.ts:284–287` and `src/data/mindguide-problems.ts`.

Fix: separate display prose from machine-checkable answers. Support explicit rounding tolerance, units, and named answer parts where the approved question requires them. Test every enabled problem against faculty-approved equivalent answers and plausible incorrect alternatives.

### 3. The scorecard does not actually assess the final methodology or reflection — P1, Reproduced / Code-confirmed

Evidence: `functions/src/workflow.ts:283–357`. Three criteria are calculated from corrective-cycle counts; the methodology and reflection strings are not evaluated. Deliberately unrelated text did not reduce the score. Criterion evidence consists largely of generic assertions that gates were accepted; each non-accuracy criterion has a 12-point floor.

Fix: implement a faculty-approved rubric tied to actual response IDs and evidence, including the final explanation. Record assistance separately so asking for useful help is not automatically treated as weak thinking. Preserve old scorecards with a rubric version; do not silently reinterpret historical results. Until calibrated, describe these as formative reasoning indicators, not validated measurements of critical-thinking improvement.

### 4. “Partial step” support reveals complete answers before scoring — P1, Reproduced

Evidence: `functions/src/workflow.ts:266–273` selects a worked solution step using the reasoning-phase index, clamped to the last available step. Real seeds returned `40 / 5 = 8`, `7 / 10 = 0.70 = 70%`, and `6 * 5 * 4 = 120` during guided computation. Three correction cycles unlock this support.

Fix: author and validate phase-specific hints separately from worked solutions. Before final scoring, permit only reviewed prompts, setup scaffolds, or incomplete operations that do not supply the target result. Test every enabled problem and support level; renaming the button or hiding it in the UI is insufficient.

### 5. Free-form acceptance trusts an unverified AI-generated solution — P1, Code-confirmed

Evidence: `functions/src/ai.ts:45–56,214–235` and `functions/src/sessions.ts:244–296`. The generated `supported` and `solvable` flags control acceptance. A successful response can structurally contain empty solution arrays, answer, or prompts; there is no independent mathematical verification of the generated solution before it becomes the private reference.

Fix: require complete successful-result fields and validate against the enabled topic's answer/solver capabilities. For numeric or symbolic tasks, verify the generated reference with deterministic checks. For proof or semantic cases outside validated checking capabilities, decline with a clear explanation or hold for faculty review; never invent certainty. Keep learner-entered problems in the pilot only within these boundaries.

### 6. Gate evaluation lacks prior learner reasoning and key reference conditions — P1, Code-confirmed / Verification gap

Evidence: `functions/src/ai.ts:137–156`. Gemini receives the current response, problem, concepts, formula, and theorem, but not accepted prior responses, managed theorem conditions, or the worked reference. A later answer can therefore be evaluated without knowing whether it is consistent with the learner's chosen method. Acceptance also depends on the model's self-reported `high` confidence.

Fix: supply bounded, version-pinned prior reasoning and relevant private checks; validate structured output and contradictory diagnosis states. Add deterministic checks where applicable. Evaluate false acceptance, false rejection, prompt injection, and answer leakage using faculty-labeled fixtures. No claim is made that a live prompt-injection attack was reproduced in this review.

### 7. Legitimate symbolic responses are rejected by English word-count heuristics — P1, Reproduced

Evidence: `functions/src/workflow.ts:104–121`. A computation response containing only `2+2=4` was classified as too short and never reached semantic evaluation. The UI and contract permit mathematical responses, but the gate counts mostly English/alphanumeric words.

Fix: validate response sufficiency by phase and parsed mathematical structure. Require prose where explanation is the task, while allowing valid symbolic work in computation/checking phases. Provide compatible guidance for concise explanations and the intended student language policy.

### 8. The 99-record bank contains only 33 distinct questions — P1, Reproduced

Evidence: `scripts/problem-bank-v4-core.ts:34–59`. Variants 2 and 3 prepend a draft label to the original question and reuse its solution. Removing that label yields 33 unique question texts from 99 records. The drafts are honestly labeled, but they do not provide meaningful non-repeating practice.

Fix: replace copies with genuinely different, independently checked variants for each enabled topic/difficulty. Preserve three approved variants per difficulty for the selected pilot topics. Review assumptions as well as calculations: for example, `qm-var-001` should explicitly specify population or sample variance.

### 9. One incomplete topic blocks every new session — P1, Code-confirmed

Evidence: `functions/src/configuration.ts:115–179` and `functions/src/sessions.ts:203–211`. The readiness gate requires exactly 11 topics, 33 cells, and 99 approved records before either prepared or learner-entered sessions can start.

Fix: implement the user's selected approved-subset policy. Store explicit enabled pilot topics and evaluate readiness per enabled topic, requiring complete approved variants, prompts, references, and an applicable policy. Incomplete topics remain unavailable; adding an unrelated draft must not close an already approved pilot.

### 10. Approval checks do not establish that evidence matches the current instructional content — P1, Code-confirmed

Evidence: `functions/src/admin.ts:261–315`, `functions/src/configuration.ts:115–179,182–275`, and `scripts/release-preflight.ts`. Readiness largely trusts a nonempty `validationRecordId`. Validation records are not re-read to verify their decision and matching version; independently editable linked references/prompts can change the effective instructional material.

Fix: approve a content manifest containing problem, private solution, prompt, reference, and rubric versions/hashes. Check the immutable decision against that manifest at release and session creation. Any material edit requires renewed validation. An administrator may record external faculty evidence, but arbitrary text in an evidence field is not proof of faculty review.

### 11. Difficulty recommendations use inconsistent policies — P1, Code-confirmed

Evidence: `functions/src/sessions.ts:709–730` computes the submission recommendation with default thresholds and two sessions, while `selectAdaptiveProblem` at line 985 resolves managed policies. `arithmeticErrorAloneLowersDifficulty` is accepted as configuration but not used in `recommendDifficulty`.

Fix: use one versioned recommendation service for submission, dashboard, and assignment. Apply the pinned policy consistently, implement or remove ineffective settings, and reject contradictory thresholds. Show the same recommendation that actually drives the next assignment.

### 12. Adaptive evidence can include unsubmitted work and miss relevant history — P1, Code-confirmed

Evidence: `functions/src/sessions.ts:701–717,990–1008`. Queries fetch the latest 10 or 30 sessions across all topics by `updatedAt`, then filter locally for a topic and scorecard. Scored but unsubmitted/abandoned sessions can qualify; activity in other topics can push valid evidence out of the window. A configured minimum above 30 cannot be satisfied by the assignment query.

Fix: query committed learning evidence by stable topic ID and submission time, using the policy's required sample size. Exclude unfinished/abandoned attempts from completed-session adaptation. Treat returned retries as assisted follow-ups when interpreting progress, because their original solution was already shown.

### 13. Repeated errors within one session are treated as errors across sessions — P1, Reproduced

Evidence: `functions/src/workflow.ts:429`. Two `invalid_logic` entries in one session and none in the other caused a downgrade with a message claiming repetition across two sessions.

Fix: deduplicate categories within each session, then count the number of distinct sessions exhibiting each category. Test one-session repetition versus genuine repeated difficulty over multiple sessions.

## B. Access, privacy, and operational integrity

### 14. Maintenance/release settings do not enforce a shutdown — P1, Code-confirmed

Evidence: the maintenance UI writes `system_settings/maintenance` (`src/app/components/SecureAdmin.tsx:133`), and the migration writes `formalEvaluationEnabled: false`, but session entry points do not consult either control. The runbook nevertheless instructs operators to rely on maintenance mode.

Fix: enforce typed server-side release and maintenance controls in new-session and follow-up entry points. Provide a drain mode that stops new work and a write-freeze mode for migration, with safe administrative recovery access. Display the actual server state in the interface.

### 15. The selected controlled pilot has no cohort admission control — P1, Code-confirmed gap

Evidence: public signup/Google sign-in and `bootstrapProfile` create active student profiles. Academic profile completion does not verify enrollment, and the inspected server has no invited-cohort gate. App Check does not establish that a person is an approved research participant.

Fix: admit students through an administrator-managed roster tied to verified authentication identities. Unapproved accounts must not start sessions or access study content. Apply the same rule to both sign-in providers and follow-ups. Do not infer institutional identity from self-entered student numbers.

### 16. “Anonymization” leaves direct academic identifiers — P1, Code-confirmed

Evidence: `functions/src/privacy.ts:130–175` merges a replacement name and null email into the existing profile, leaving `academicProfile.studentNumber`, course, year, and section. Session `studentId` and potentially identifying free text/notifications are also retained. The routine then marks anonymization complete.

Fix: inventory identity-bearing fields and linked records, remove direct identifiers, and document whether retained data are pseudonymous or actually anonymous. Include academic profiles, response text, audit details, notifications, and backup retention in that inventory. Verify the whole resulting dataset before marking the operation complete.

### 17. Saved retention settings are partly ineffective — P1, Code-confirmed

Evidence: `aiLogRetentionDays` is accepted by `functions/src/validation.ts`, but AI logs in `functions/src/sessions.ts:371,537,982` always expire after 90 days. The anonymization eligibility test also skips users whose profile activity is after the fixed study-closure retention cutoff, rather than defining a rolling or absolute retention rule.

Fix: choose one explicit study retention policy with the institution, use its configured values when creating/processing records, and handle changed policies consistently. Include dates and operational deletion behavior in the consent notice; avoid describing configuration fields as functional until they are enforced.

### 18. Retention queries lack a deployable index and complete backlog processing — P1, Code-confirmed configuration gap

Evidence: `functions/src/privacy.ts:65` queries the `private_ai` collection group by `expiresAt`, but `firestore.indexes.json` does not declare the corresponding collection-group index. Cleanup queries process at most 500 records once per run; some scans have no cursor and may repeatedly select already-handled records.

Fix: declare and verify the collection-group index in staging. Process bounded pages with continuation/progress tracking, capture permanent failures, and alert on overdue backlog. Emulator success alone does not prove production index readiness. Existing cloud indexes were not inspected.

### 19. The expiry scheduler can overwrite a freshly resumed or submitted session — P1, Code-confirmed

Evidence: `functions/src/privacy.ts:74–99` reads inactive sessions, then writes `expired` without a transaction or update-time precondition. A response or submission between the read and write can be overwritten.

Fix: re-read status, activity time, and revision transactionally before expiring; skip changed sessions. Test an interleaving where a learner submits after selection but before expiration. Reminder creation must likewise tolerate concurrent runs.

### 20. Bulk operations can report success without observing individual write failures — P1, Code-confirmed

Evidence: announcement, deletion, retention, and migration paths enqueue BulkWriter writes without awaiting their returned promises, then await `close()`. The installed Firestore declaration explicitly states that the close promise never rejects (`node_modules/@google-cloud/firestore/types/firestore.d.ts:1184`). Examples include `functions/src/admin.ts:573–599,672–693` and `scripts/migrate-v4.ts:427–434`.

Fix: observe every write outcome and persist resumable job progress. Do not count recipients as delivered or mark deletion/rollback complete until required writes succeed and verification passes. Inject a permanent single-document failure into each affected workflow.

### 21. Account deletion cannot recover from a specific partial failure — P1, Code-confirmed

Evidence: `functions/src/admin.ts:654,683–690`. If Auth deletion succeeds but removing the Firestore profile fails, retry calls `getUser` again while the profile still exists and receives `auth/user-not-found` before reaching resume logic.

Fix: use the deletion job as the authority for completed phases, tolerate an already-deleted Auth identity, and bind jobs to their original target. Verify retry from every boundary. Clearly distinguish retaining pseudonymized learning records from deleting all personal data.

### 22. Content deletion can succeed without its audit/completion record — P1, Code-confirmed

Evidence: `functions/src/admin.ts:618,626–631`. Recursive deletion happens before the audit/idempotency transaction. If the latter fails, retry stops because the content no longer exists.

Fix: create a durable deletion job/tombstone before deletion and finish its audit idempotently after deletion. Recheck dependency/status changes safely. Test a failure after deletion but before recording success.

### 23. Scoring failure leaves the browser on a stale draft revision — P1, Code-confirmed

Evidence: `src/app/components/SecureSession.tsx:131–143`. Draft saving increments the server revision, but the component updates its session state only after scoring also succeeds. If scoring fails, clicking again submits the old revision.

Fix: adopt the saved session immediately, preserve the draft, and retry finalization independently. On uncertain outcomes, reload the authoritative record before deciding whether to repeat the operation. Test save-success/finalize-failure/retry.

### 24. Client retries do not retain the same logical request identifier — P1, Code-confirmed

Evidence: `src/lib/secure-api.ts` creates a new UUID by default for each invocation; the learner UI does not retain one across uncertain network outcomes. A lost start-session response followed by a retry can create a second session; revisioned mutations instead tend to produce confusing stale-state errors.

Fix: keep a stable request ID and input snapshot for each pending operation until resolved. Bind server idempotency records to an input fingerprint, return the original result for retries, and reconcile current state after a timeout. Make assignment reservation and session creation one recoverable operation so failed starts do not consume a variant rotation.

### 25. Reload/history views lose useful learning evidence — P2, Code-confirmed

Evidence: `SecureSession` restores the session document but not prior unlocked hint content or the last diagnosis. Unsubmitted typed drafts exist only in component state until scoring is requested. `src/app/components/SecureStudent.tsx:177` renders only `response.plainText`, omitting LaTeX-only answers; worked mathematical output is largely rendered as raw strings.

Fix: restore response/diagnosis/support history from server records, provide draft persistence, and use a shared safe mathematical renderer in learning, review, and print views. A requested hint must remain accessible after reload without another support charge.

### 26. Usage reports show zero responses for new-workflow sessions — P1, Code-confirmed

Evidence: `functions/src/reporting.ts:89` counts `session.phaseResponses`; new sessions initialize that legacy array empty, while evaluation writes `sessions/{id}/responses` (`functions/src/sessions.ts:524`). The array is not updated by the new evaluator.

Fix: maintain an authoritative response count transactionally or aggregate the canonical response records. Backfill existing records, and test reports against sessions with known attempts and AI calls. Do not use zero-filled legacy fields as research evidence.

### 27. Report filters and totals can misrepresent the study dataset — P1, Code-confirmed

Evidence: `functions/src/reporting.ts:14–38` ignores subject/topic/date filters for learning-progress reports, limits source rows before misconception aggregation, and filters other reports by mutable `updatedAt`. Preview/export responses provide no complete pagination or explicit truncation status.

Fix: define report populations and stable event dates, implement real filtering and cursor-based export, and identify partial results explicitly. Aggregate over the full selected population. Test more records than the current limits and verify that reviewing a session does not move its original completion into a different reporting period.

### 28. Follow-up sessions bypass current-consent checks — P1, Code-confirmed

Evidence: normal session creation calls `requireCurrentConsent`, while `createFollowUpSession` at `functions/src/sessions.ts:800` does not. A student can begin new learning through a returned session after the consent version changes.

Fix: share admission, consent, maintenance, and applicable topic eligibility checks across every session creation path. Preserve historical viewing according to the approved privacy policy while requiring current consent before new study activity.

## C. Migration, verification, and performance

### 29. The migration instructions can skip required legacy security conversion — P1, Code-confirmed

Evidence: the staging runbook runs v4 alone, while its production section still describes v3. `scripts/migrate-v4.ts:294–307` only adds catalog/version fields to sessions; its verifier scans problem documents for forbidden fields, not historical session documents. It does not itself perform v3's public/private session conversion.

Fix: enforce supported source schema prerequisites and publish one ordered, version-aware migration procedure. For a v2 dataset, perform and verify its security conversion before v4/pilot changes. Scan every learner-readable legacy projection for hidden answers, verify historical access and counts, and rehearse rollback from the exact backup manifest. Do not roll back to an insecure prototype with learner access open.

### 30. Release preflight can confuse counts and manual flags with proof — P1, Code-confirmed

Evidence: `scripts/release-preflight.ts` counts records/prompts and reads `MINDGUIDE_GATE_*` environment flags. It does not verify matching faculty manifests, complete private references, deployed IAM/App Check/rules/indexes, or actual restoration evidence. Hosting deployment does not require a successful comprehensive preflight.

Fix: unify catalog eligibility and preflight logic; separate machine-verified checks from signed external evidence. Attach exact artifact/project/commit references to owner attestations and make the release process stop on missing evidence. Replace exact global counts with the agreed pilot manifest.

### 31. Passing current tests does not establish end-to-end learning correctness — P1, Verification gap

Evidence: all 110 existing unit/component/Functions tests passed despite the reproduced answer-credit and hint-leak defects. Many tests use fixtures/mocks; authenticated staging checks require separate credentials. No completed live learning workflow, calibrated AI assessment, recovery/load exercise, or backup restore was demonstrated in this review.

Fix: add regression tests for findings 1–30, transaction tests using real emulators, and complete staging journeys for each role. Evaluate every enabled problem type with faculty-labeled valid/invalid answers. Test 50 simultaneous students provisionally, including slow networks, AI quota errors, and reconnects; increase the target if the approved sample requires it.

### 32. Moderate production dependency advisories remain — P2, Verified audit output

Evidence: `npm audit --omit=dev --audit-level=high --json` returned no high/critical findings but ten moderate dependency entries, including `qs` and `uuid` and their dependent packages. A zero exit code at the high threshold is not a clean audit.

Fix: update compatible vulnerable dependencies, examine actual reachable paths, and document any remaining risk. Do not blindly apply suggested major downgrades to Firebase packages. Repeat audit and functional checks after the chosen update.

### 33. Browser payload and operational performance are not yet demonstrated — P2, Build evidence / Verification gap

Evidence: the production build produced roughly 1.03 MB and 1.10 MB minified JavaScript chunks, approximately 278 KB and 309 KB gzip, with Vite size warnings. The configured Functions limits and per-user request throttles are not evidence of acceptable latency or a project-wide spending ceiling.

Fix: profile the landing and first learning interaction on representative phones and networks; split/load math tooling where measurements justify it. Record p50/p95 latency, timeout/error rate, token cost per session, and Firestore reads per start. Add project budgets, alerts, and an enforced stop-new-work control. Treat optimization as measured work, not an unsupported claim that the application is unusably slow.

## D. Manuscript and research design

### 34. Respondent count is contradictory — P1, Manuscript-confirmed

The Respondents paragraph specifies approximately 50 students; Table 2 lists 400 and 100%. The user confirmed the number is undecided. Distinguish the eligible population, planned sample, actual recruited sample, and final analyzed sample. Obtain adviser confirmation before replacing either number or reporting results.

### 35. The supplied questionnaire measures expected usefulness, not post-use acceptability — P1, Manuscript-confirmed

Appendix C ends with Section D, “Proposed MINDGUIDE Features and Techniques,” using statements such as “would help.” There is no separate post-use acceptability instrument in the supplied document, although Objective 4 promises evaluation of the implemented system.

Fix: retain needs assessment as a separate phase. Add a faculty-reviewed post-use instrument covering actual usability, functionality, relevance, clarity of feedback, and the six core capabilities, administered after a documented task protocol. Define missing-response handling, scoring, instrument validation, and the boundary between survey records and identifiable application logs.

### 36. The scorecard has conflicting definitions — P1, Manuscript-confirmed

Definition of Terms and the AI architecture use accuracy, logical validity, method selection, and explanation quality. The storyboard uses accuracy, logic structure, justification quality, and reasoning consistency. Table 18 uses accuracy, reasoning, justification, and reflection; the functional requirement wording lists five constructs.

Fix: adopt one four-criterion formative rubric, publish descriptors and scoring anchors, and update every diagram, dictionary, screen, questionnaire, and implementation reference. Have faculty validate the rubric and evaluate agreement against actual student work before claiming measurement validity.

### 37. Solution-release and scoring order conflict — P1, Manuscript-confirmed

The progressive-unlock storyboard describes score updates after unlock events; the scorecard storyboard and student workflow figure place scoring after progressive solution exposure. The implementation intends scoring before full release. The manuscript also describes different sets of learner-visible stages in different places.

Fix: use one sequence: four visible stages containing seven checks, save and assess the learner's final work, then release the worked solution and submit the immutable record. Distinguish safe hints during reasoning from full answer exposure. Update flowcharts and acceptance tests together.

### 38. Database diagrams and dictionary do not describe the implemented storage — P1, Manuscript-confirmed

Figures 38–39 show relational IDs/foreign keys, password/password-hash fields, and problem answers alongside public problem content. The dictionary partly changes these to Firestore references but retains conflicting names/types. The implementation uses Auth identities, documents/subcollections, private solution records, and versioned session projections.

Fix: regenerate the data model from shared contracts and rules. Document Auth as the credential authority; do not store passwords in application profiles. Show learner-readable versus private paths, approval evidence, consent, lifecycle states, and indexes. Reconcile profile details: manuscript section is optional and year level numeric, while code requires section and stores year level as text.

### 39. Architecture and administration claims exceed the described implementation — P2, Manuscript-confirmed / Code-confirmed

The stack figure names Auth/Firestore/Gemini but omits the trusted Functions runtime, Secret Manager, App Check, scheduler, and security boundaries. Some passages imply saved content instantly affects active sessions; code intentionally snapshots configuration. “Backup/security maintenance” and “user feedback/system issues” are described without a complete corresponding operator workflow in the reviewed application.

Fix: document actual request/data paths and version-pinned content behavior. Define backup/incident work as an external operator runbook unless implementing it in-app. For the pilot, use a documented study support/feedback channel and avoid claiming unimplemented in-app ticket management.

### 40. Required academic validation artifacts are absent from the supplied manuscript — P1, Verification gap

The scope promises officially approved syllabi, a validated content matrix, and a validated problem bank, but the supplied appendices do not include those artifacts or a scored rubric with evaluator evidence. This does not prove the team lacks them elsewhere.

Fix: obtain references to the actual course outlines, learning outcomes, enabled topic/difficulty matrix, worked answers, hints, supported notation, and faculty decisions. Attach or cite them in the manuscript and link immutable evidence to the deployed pilot manifest. Do not mark generated drafts approved without external review.

### 41. Learning-effect and competitive claims need narrower evidence — P2, Manuscript-confirmed

The scope correctly limits the study to acceptability/perceived usefulness, yet other passages describe enhancing development or effectiveness in stronger terms. The comparison matrix marks competitors absent for broadly overlapping capabilities, while its narrative acknowledges hints/adaptation. Exact branded module names are not a sufficient comparison criterion.

Fix: state that the study evaluates acceptability and perceived reasoning support, not causal or lasting critical-thinking gains. Define comparison criteria operationally and support them with dated primary evidence; distinguish “not documented” from “not available.” Independently verify bibliography/DOI details before submission; this review did not authenticate every citation.

### 42. The manuscript still needs proposal/final-document reconciliation — P2, Manuscript-confirmed

Despite the filename, the title page says “A Proposal Project,” results chapters are absent, and the roadmap places institutional deployment in 2030 and scorecard expansion in 2032. Table/figure lists have numbering mismatches and duplicate captions. The hardware table presents 8 GB RAM and 256 GB available storage as website requirements without measured client evidence.

Fix: label the present artifact accurately as a proposal until evaluation is performed; align the pilot schedule with the capstone timeline. Separate development-machine specifications from supported browser/device/network requirements. Regenerate tables of contents/figures/tables and captions in Word, reconcile tense and cross-references, and conduct a full rendered-page proofread before submission.

## Repair sequence and implementation decisions

### Phase 1 — Establish trustworthy answers and release boundaries

Resolve findings 1–10 first. Add versioned typed answer specifications to protected problem references, phase-specific safe hints, and response-linked rubric evidence. Preserve the four visible stages and seven server-owned checks. Keep scoring immutable once the full answer is released. Existing scores remain labeled with their original rubric version; they must not be used as calibrated study outcomes.

For the pilot, enable only explicitly selected, faculty-approved topics. Each enabled topic needs three real variants at each of Basic, Intermediate, and Advanced difficulty. Retain both subject areas in the study; if a subject has no ready topic, defer that part of formal evaluation rather than present unsupported coverage. Learner-entered problems must pass the same topic/format boundary and independent reference checks; unsupported semantic/proof cases require review or rejection.

Deliverable: a traceability matrix connecting manuscript requirement, enabled content, implementation, failure behavior, and test evidence. Each problem approval covers the exact instructional manifest used in new sessions.

### Phase 2 — Make learning records reliable

Resolve findings 11–13 and 19–28. Use one adaptation implementation and only committed, topic-specific evidence. Make operations retryable with stable IDs, durable deletion jobs, observed write outcomes, and transaction-safe lifecycle changes. Restore drafts and support history; render mathematical responses consistently. Reports must query the actual schema, define their population/time basis, and disclose or eliminate truncation.

Public interface changes: add operation recovery metadata; versioned rubric/evidence and answer-format types; per-topic readiness reasons; report cursors/completeness metadata. Keep private answer specifications out of browser projections. Introduce an explicit schema/workflow version for incompatible changes and preserve read-only historical compatibility.

### Phase 3 — Secure the controlled pilot and reconcile the manuscript

Resolve findings 14–18 and 34–42. Add verified cohort admission and enforce maintenance/release gates on every new-session path. Implement the institution-approved retention policy and verify identifier removal. Update the manuscript's architecture, data model, rubric, workflow, questionnaire, and scope from the final implemented behavior.

External academic deliverables: approved sample/protocol, syllabus/content evidence, rubric review, post-use instrument, participant notice, and faculty validation. These require real institutional decisions; software cannot fabricate them.

### Phase 4 — Rehearse and release

Resolve findings 29–33. Provision a dedicated staging project; configure least-privilege runtime identity, secrets, App Check, required indexes, authorized auth domains/providers, and privacy dates. Default local development to fully emulated Auth/Firestore/Functions or a deliberately isolated staging target: the current `npm run dev` emulates only Functions and retains real Auth/Firestore connections. Firebase documents that non-emulated services can access live resources: [Functions emulator documentation](https://firebase.google.com/docs/emulator-suite/connect_functions).

Run migrations on a restored staging copy, verify an idempotent second apply, exercise rollback, then repeat all release checks against the exact candidate commit. Use maintenance controls for cutover and deploy the matched Functions/rules/indexes/frontend set. Open access only to the approved cohort after smoke tests pass. A model/provider upgrade requires the same AI evaluation regression set; verify its availability at release using [Google's model lifecycle documentation](https://ai.google.dev/gemini-api/docs/deprecations).

## Acceptance tests and deployment gates

- **Answer correctness:** reject substring/negation/sign errors; accept equivalent approved numeric/symbolic/multi-part forms; test all enabled problem variants, including tolerance and assumptions.
- **Assessment:** unrelated methodology/reflection cannot earn full explanation credit; rubric evidence points to actual learner work; faculty calibration results and uncertain cases are reported honestly.
- **Disclosure:** no hint, diagnosis, response projection, raw database document, URL/revision bypass, or AI response releases the full answer before scoring.
- **Session integrity:** duplicate requests, lost responses, multi-tab edits, save/finalize failure, expiry/resume race, and retry after every deletion boundary preserve correct state and exactly-once statistics.
- **Access/privacy:** unauthorized or non-cohort users, stale admin claims, changed consent, archived content, and maintenance freezes are enforced server-side. Deletion/retention outcomes are verified across linked data and can resume after partial failures.
- **Research reports:** known fixture data produce exact counts, filters, date inclusion, full exports, and transparent pseudonymization. Survey results are separate from application performance scores.
- **Runtime:** complete student and administrator staging journeys with the deployed rules/indexes/App Check; verify Google sign-in and password-reset delivery; test real phone input, keyboard accessibility, and poor-network recovery.
- **Operations:** measured load/latency/cost, quota-exhaustion behavior, working alerts, managed backup/restore, verified migration/rollback, configured retention, and an approved release artifact. Provisional load target: 50 concurrent participants; no capacity claim until measured.

Release requires closure of every applicable P1 item, an explicit disposition for P2 items, and genuine external evidence. UI polish or a passing build must not override these gates.

## Verification record

Confirmed during the review:

- Frontend/unit/component tests: 82 passed in 19 files.
- Functions tests: 28 passed in 6 files.
- Frontend and Functions TypeScript checks: passed.
- Production build: passed, with the large-chunk warnings described in finding 33.
- Production dependency audit: 0 high, 0 critical, 10 moderate dependency entries.
- Direct behavior checks: findings 1, 2, 3, 4, 7, 8, and 13 reproduced without cloud writes or paid AI calls.

Final checks completed on 6 September:

- Firestore Emulator authorization tests: 9 passed. Expected permission-denied messages came from negative authorization tests.
- Public Chromium browser tests: 6 passed, including mobile navigation, theme switching, and the missing-route screen.
- ESLint: passed with no reported findings.
- Browser bundle scan: passed; 27 assets checked against 9 markers and 307 curated private strings. This does not test runtime hint/AI disclosure.
- Total automated tests observed passing across these suites: 125.

Authenticated staging, faculty calibration, cloud configuration, and restoration remain unverified. No application code fix is claimed by this audit.
