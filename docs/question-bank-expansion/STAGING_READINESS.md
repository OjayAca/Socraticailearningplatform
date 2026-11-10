# MINDGUIDE question-bank staging readiness

**2 November 2026 · BLOCKED for remote staging.** The application web and server configs select `socratic-ai-a7765`. No separately verified target or staging credential was supplied. The importer, rollback and learner-confidentiality fixes have local regression coverage. Independent academic review is pending for all 84 candidates.

[Firebase inventory, setup, import and rollback procedure](STAGING_RUNBOOK.md) · [Individual academic review](ACADEMIC_REVIEW.md) · [Original dry run](DRY_RUN_REPORT.md)

## What changed

| Files changed in this task | Purpose |
|---|---|
| `.gitignore`, `scripts/lib/staging-target.ts` | Ignore local attestation and audit files. Require an explicit project, unexpired owner evidence, isolated service account from outside the repository and matching database marker. Reject the application project and emulator overrides. |
| `scripts/stage-question-bank.ts`, `scripts/lib/staging-bank-plan.ts`, `scripts/lib/staging-bank-run.ts` | Pinned expansion-only CLI, baseline verification, bounded transactional creates, ownership receipts, retry and scoped rollback. No approval input. |
| `scripts/import-question-bank.ts`, `scripts/question-bank-documents.ts` | Reuse the existing document layout, reject duplicate document paths and block expansion IDs in legacy apply mode before Firebase initializes. The original importer keeps its 480-document limit and original approval workflow. |
| `scripts/migrate-v5.ts` | The older staging migration now uses the same independently verified staging client. Its retired sample-data apply remains disabled. |
| `app/api/staging-identity/route.ts`, `scripts/staging-browser-setup.ts`, `scripts/verify-staging-e2e.mjs`, `playwright.config.ts` | Tie credentialed and remote browser tests to an owner-attested deployment and verified backend. The route is disabled by default. |
| `src/lib/learning/student-response.ts`, `server/gemini.ts`, `server/services/LearningService.ts` | Explicit nested student DTOs. Apply the same projection to active sessions, stored results, mutation retries and recovery. Check ownership before following an active assignment. |
| `src/lib/learning-service.ts`, `src/lib/learning/projection.ts`, `src/lib/learning/validation.ts` | Allowlist catalog and legacy response fields. Strip instructor import fields from student-facing results and reject them in managed public content writes. |
| `src/app/components/SecureSession.tsx`, `src/app/components/SecureStudent.tsx` | Apply allowlists to resumed sessions, tutor messages and history. Preserve learner-visible administrator feedback and previously released legacy solutions. |
| `tests/unit/staging-bank.test.ts`, `tests/unit/staging-identity.test.ts` | Verify environment rejection, deployment binding, the actual 924-document transaction plan, replay, manifests, loss of acknowledgement, dependencies, preservation and rollback refusal. |
| `tests/unit/student-session-boundary.test.ts`, `tests/unit/expansion-selection.test.ts`, `tests/unit/admin-service.test.ts` | Exercise the actual learning HTTP route with in-memory dependencies, student history, authorization and real draft sources across all 12 topics. |
| `docs/question-bank-expansion/STAGING_READINESS.md`, `STAGING_RUNBOOK.md`, `ACADEMIC_REVIEW.md` | Implementation, operator instructions, test scope and 84 item-level academic findings. |

The checkout already contained changes from previous work. The expansion source, combined inventory, original bank, approval evidence, adaptive policy and Firebase rules were preserved. Rerunning the offline audit produced the same `source-audit.json` hash.

## Import and rollback evidence

The actual plan contains 84 problems, 168 private children, 84 theorem/formula references and 588 prompts. No validation or scoring documents are planned. Each atomic group creates 462 content documents plus two journal writes. Before each group, the transaction checks the live marker, subjects, topics, enabled-topic links, all original importer fields and exact document versions, both groups’ content paths and the batch receipts.

In memory, a lost acknowledgement after group one left exactly 462 pending documents. Resume produced 84 draft problems, two create receipts and 924 owned paths. Reapplying added zero documents. A competing batch and a pre-existing identical private document were rejected. Rollback after a partial import deleted only the one committed group. Interrupted rollback of a complete import resumed and deleted only the remaining group. An edit, same-data rewrite, missing document, altered receipt, changed original version, scorer, decision, dependent session, managed reference or extra private child blocked the operation. The original 468 records were preserved. These are transaction-double results. Network behavior, Firestore commit timestamps, IAM and staging quotas still require a real isolated rehearsal.

## Security boundary

The learning API returns the student's question, session identity, workflow state, stage progress, gate evaluations, diagnosis, permitted support, draft, formative score and difficulty recommendation. Each nested object has its own field list. Gate keys and score criteria use fixed names. Student messages return only their display fields. Replay reconstructs completion from the sanitized session so an old cached result cannot supply its own solution. Release requires completion and recorded scoring. The history view has a separate allowlist for older records, including learner-visible review comments.

HTTP tests used unique values for instructor-only data, source guidance, expected answers, solution steps, expected reasoning, answer specifications, misconceptions, scoring references, expected stage evidence, answer keys and internal review. None appeared in active-resume, mutation, replay or recovery responses. Tests also covered another student’s assignment, gated release, nested legacy data, unauthenticated route rejection, administrator review authorization and protected answer display in the existing editor. The preview operation returns a confirmation hash and a description of the learner’s own input. The operator health operation checks role separately.

Firestore direct reads have document-level access. The application keeps instructor content in protected documents, and managed writes reject known private fields on public content. A DTO filters what the application returns or displays. It cannot redact fields from the underlying Firestore network response if a privileged external writer incorrectly places secrets on an otherwise readable document. No live learner records were inspected for that condition.

## Regression and integrity

| Check | Current evidence |
|---|---|
| TypeScript, ESLint, optimized build, browser bundle scan | Passed locally. The build reports the existing React 18 deprecation and missing `metadataBase` warnings. The staging CLI, importer and legacy staging migration also passed a separate strict TypeScript check. |
| Full Vitest | 546 passed in 51 files. Includes the prior 499-test baseline, the existing expansion editor test and 46 additional cases. No existing test was disabled. |
| Playwright | 15 public, responsive and hydration tests passed locally. 29 cases requiring accounts or existing sessions were skipped. No live account was used. |
| Selection and adaptive behavior | All 24 draft-only/pending-only cases returned `question-bank-exhausted`. All 12 mixed-catalog cases selected approved Basic originals. The existing 36-assignment, adaptive-policy and regression suites passed. |
| Firestore rules | Remote rerun blocked by the stop-before-remote instruction. The saved simulator report contains 63 successes. Its recorded tested-source SHA-256 is `a7559f0a57df02c1e3a3d7957dd2cbacccf34b8d31477dc641e3564881269447`, and current local rule text matches that saved source after newline normalization. |
| CLI negative checks | Missing staging configuration, legacy expansion apply, an unexpected approval argument and the unverified legacy staging command all exited before remote operations. Git ignores the attestation, local audit and staging env files. |
| Original inventory | 36 originals match the combined source. The isolated rehearsal preserved all 468 original records. The earlier read-only catalog inspection remains the available production evidence. |
| Draft inventory | 84 local candidates across 12 catalog topics, giving a proposed total of 120. Basic/intermediate/advanced counts are 48/36/36 combined. Duplicate IDs and duplicate normalized statements across the combined bank are both zero. |
| Student exposure and mutations | Zero draft assignments and zero restricted marker fields in the exercised local responses. No production or learner-history modifications were performed. No adaptive policy change, question approval, publication, Git commit, push or deployment occurred. |

The final full check on the settled files passed through the browser bundle scan, with all 546 Vitest cases passing. The separate browser run finished with 15 passing and 29 skipped.

Two intermediate failures were investigated. A release check initially required gate evaluations even when all authoritative gate states had already been accepted. The final check uses completed stage progress and the existing scoring test passes. A later run picked up an older in-memory subject fixture while the live catalog-name check was being tightened. The fixture now includes the actual source subject name and the production guard remains in place.

[Source audit](source-audit.json) · [Saved simulator results](deployed-rules-results.json) · [Saved tested rule source](deployed-rules-source.json)

## Academic disposition

All 84 item IDs have a pending faculty-review row. `DM-04-I02` gives away its symbolic premises and conclusion, `QM-12-I03` has an ambiguous payoff statement and supplies the marginal probability, and a `QM-12-A02` corrective hint names the requested break-even price. Each of A–F uses one common prompt across all 84. D, E and F also have only one distinct expected-evidence string each. The review proposes item-specific prompts and checks for difficulty calibration. No source wording was revised or approved.

**Next decision.** The owner must supply a separately verified project, staging-scoped access, catalog baseline and deployment identity. Review the read-only impact before authorizing a staging write. Faculty can begin reviewing the local draft materials now. Remote staging and production review remain outstanding.
