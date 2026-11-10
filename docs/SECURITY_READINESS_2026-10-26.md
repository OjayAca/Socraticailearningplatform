# Security remediation and deployment readiness — 26 October 2026

Status: **NOT READY FOR DEPLOYMENT**. No application, rules, indexes or migrations were deployed. Evidence is in `security-evidence-2026-10-26/`. The working tree already contained substantial uncommitted implementation and question-import work; it was preserved.

## Initial findings and exact security failures

Actual stack: Next.js 16.4.3 installed, React 18, Firebase Authentication/Firestore, Firebase Admin SDK, Gemini server integration, Vitest and Playwright. `app/api/learning/route.ts` is a dynamic Node route. `firebase.json` configures Firestore rules/indexes only; it does not establish an application hosting pipeline.

Both rule suites were executed against Firebase's Rules test API using simulated requests, without Firestore writes or emulators. All 63 local checks passed. The deployed source passed 60 and failed exactly these three:

| Check | Expected | Actual deployed behavior | Root cause | Local fix status |
|---|---|---|---|---|
| audited academic edit | ALLOW | DENY | Deployed `/users/{uid}` update rule has no audited academic-profile branch. | PASS: existing `academicEdit()` and `academicField()` constrain fields and require matching audit actor/action/target/reason/time. |
| account transition anonymized to active | DENY | ALLOW | Deployed status rule checks only the destination status, allowing reactivation from anonymized. | PASS: existing source/destination transition allowlist excludes anonymized. |
| account transition deactivated to suspended | DENY | ALLOW | Same destination-only rule ignores the permitted lifecycle transition from deactivated. | PASS: deactivated permits only active. |

The service rejects invalid transitions through `src/lib/account-transitions.ts` and `src/lib/admin-service.ts`, but those client checks cannot secure direct Firestore requests. The deployed policy is the root cause, not authentication setup or a broken simulator. The deployed rules compile without issues; these are expectation mismatches, not compilation errors. The deployed source differs from local rules only in these academic-edit and status-transition sections (apart from whitespace).

Deployed ruleset: `projects/socratic-ai-a7765/rulesets/ff06078f-45f0-4cd4-bdcf-9577edf7620b`. `deployed-source.json` contains the exact downloaded source; `deployed-rules.txt` retains full expression diagnostics. `deployed-summary.json` records named outcomes, expectations, source hash and timestamp. The log ends with `Error: Rules simulator checks failed.` as expected. These three remote failures remain unresolved until an authorized deployment is verified.

## Changes in this pass

- `scripts/test-spark-rules.ts`: optional `--report=<file>` records compact named outcomes, timestamp and tested source hash, including failures; `--source-report=<file>` saves the tested source and remote ruleset identifier for review and rollback planning. Test expectations and enforcement are unchanged.
- `tests/unit/admin-service.test.ts`: adds a regression proving suspension of a deactivated learner fails without modifying the profile, committing a transaction or creating audit records.
- This report and its evidence directory document current results and live limitations.

No new rules fix was necessary: the correct minimal fixes were already present in the working tree. They were retained and verified, not replaced or weakened. Existing rule tests cover audited edits, identity/role tampering, invalid fields, missing/wrong audit evidence, and both forbidden transitions. Prior implementation changes remain separately attributable to earlier work.

## Security boundaries inspected

- Rules require active profiles; administrator access requires both the admin token claim and admin profile role. Claim-only elevation fails.
- Learners cannot edit published questions, read private solutions/scoring references, forge responses/scorecards, modify another learner's progress, or write shared quotas. Session history is owner-scoped; final-draft updates cannot change gates.
- The learning route verifies Firebase tokens; `LearningService` checks active status, consent, roster and session ownership before server-owned writes. A fresh unauthenticated POST to the local `/api/learning` returned **401**.
- `next.config.mjs` forwards only an explicit public Firebase configuration allowlist. `.env*`, credentials and backups are ignored. The production browser bundle scan passed against 12 secret markers and 357 private content strings.
- Local `.env` plus `.env.local` configuration has required server variables present and matching backend/frontend Firebase project IDs. Values were not printed. This does not verify a remote host's secret configuration.

## Executed regression checks

| Command/check | Result | Scope |
|---|---|---|
| `npm run check` | PASS: typecheck, lint, 437 tests / 42 files, production build, bundle scan | Local; unit/component tests use isolated in-memory mocks, not deployed acceptance |
| `npm run test -- tests/unit/admin-service.test.ts --maxWorkers=2` | PASS: 36 tests | Includes new forbidden-transition regression |
| `npx eslint scripts/test-spark-rules.ts tests/unit/admin-service.test.ts` | PASS | Changed code |
| `npm run test:rules` | PASS: 63/63 | Local source through remote simulator; no data writes |
| `npm run test:rules -- --deployed` | FAIL: 60/63 | Current deployed source; exact failures above |
| `npm run audit:prod` | PASS: zero vulnerabilities | Installed production dependency audit |
| `npm run test:e2e -- --workers=2` | PASS: 15; SKIPPED: 29 | Public/auth route guards, hydration, responsive public pages; authenticated environment credentials absent |
| `node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json --verify` | PASS | Read-only source/database comparison; 36 approved questions, 468 expected documents, zero duplicates/missing records |
| `npm run release:preflight` | FAIL | 36 ready approved questions and full 36-cell coverage, but hardcoded pigeonhole/regression concept requirements unmet |
| `git diff --check` | PASS | Whitespace check; not a content/security audit |

The full suite covers admin editing/publication/versioning, question assignment, security rejection, error diagnosis, assistance, gates, scorecards, persistence and duplicate prevention. Its mocked provider outcomes are not evidence of live AI correctness across the question bank. Authenticated admin catalog/edit/publish checks were not repeated live in this pass; prior catalog evidence is retained. No approved question was edited for testing.

Build warnings: React 18 deprecation and unset `metadataBase`. A verified production HTTPS origin is required before setting the latter. No origin was invented.

## Database integrity and live coverage

Read-only verification confirms all 36 approved source questions, protected references, scoring snapshots and curriculum relationships. The source hash is unchanged. The earlier QM-08-B01 submission was reread: all gates accepted, five response records, one matching scorecard, score 100, assistance count 1 and committed statistics. This is a persistence recheck, not a fresh end-to-end replay.

The user authorized Orvin Jay Acasio's account for new QA sessions. Authorized live test writes are limited to normal session/message/response/quota/progress operations through the application. No question reimport, approval fabrication, database reset, migration, deletion or prior-history replacement was performed. Existing submitted questions are excluded from normal adaptive reassignment; a fresh replay cannot be forced by resetting this student's history.

See `QUESTION_TEST_MATRIX_2026-10-26.md` for individual coverage. All imported questions use the semantic proof contract; `checkMath` returns unsupported for that contract and the real tutor must assess the question-specific reasoning against protected references. Database fidelity and assignment tests do not certify live validation, scores or calibration.

## Deployment checklist and rollback

- [x] Preserve existing data and implementation; retain lockfile and current-project configuration.
- [x] Verify local rules and run automated regressions; save deployed source for rollback review.
- [x] Confirm the prior import backup exists at `.local-backups/question-bank-1792909433149.json` (437423 bytes). This is an import-time backup, not a current full database backup; restore has not been tested.
- [ ] Complete the question-specific live matrix and resolve recorded live failures.
- [ ] Resolve the release-preflight concept requirement with the curriculum owner. Do not add unapproved topics or delete a failing gate merely to pass.
- [ ] Verify rubric calibration; a valid 100 score under final mastery is not proof of calibration across all questions.
- [ ] Identify the production Node host, verified HTTPS origin, secret configuration, previous deployable artifact and host rollback mechanism. They are not established by `firebase.json`.
- [ ] Capture a current protected backup/export if required by the release policy and verify recovery access. Do not restore over newer learner work.
- [ ] Obtain explicit authorization for coordinated application/rules deployment.

No migration is needed for the changes in this pass. Do not run historical migration/reset commands. After prerequisites and authorization: freeze a reviewed revision/artifact, run the existing deploy gate against `socratic-ai-a7765`, deploy only reviewed Firestore rules using the established Firebase CLI workflow, and deploy the Node artifact through the selected host. Do not use a broad Firebase deployment to include unrelated resources. Record revision, ruleset and URL, then rerun deployed rules tests and authenticated smoke checks for catalog integrity, access controls, answer validation, solution gating, scorecards, submissions and refreshed progress.

Rollback should restore the previous compatible application artifact while retaining all student data. The captured old rules contain the known status vulnerabilities; do not blindly restore them as a supposedly safe rollback. Prefer retaining corrected rules and rolling back the application/UI if compatibility allows. Validate any rollback rules against the same suite. Application rollback cannot yet be confirmed operational because a host/artifact has not been identified.

## Continuation — 27 October 2026

The same deployed ruleset was reread and retested: the same three checks still fail (see deployed-summary-2026-10-27.json). Read-only source/database verification again passed all 36 questions and 468 expected documents (question-integrity-2026-10-27.json).

QM-07-B01 completed through real Firebase/Gemini on the authorized student account. Incorrect work remained gated, a computation hint remained bounded, corrected work and interpretation were accepted, then solution and scorecard released. The source final answer matches. Four 25-point criteria sum to 100 with assistance count 1. Finish session persisted five assessed responses, a matching scorecard and committed progress from 2 to 3. The browser resumed after overnight interruption and showed Session submitted after final refresh. This is a completed workflow with two recorded tutor-quality failures, not a fully passing question. See the individual matrix for exact reproduction.

No remote deployment occurred during continuation. The stopped local Node server was restarted on localhost:5173 using the existing operator credential mechanism; credentials were not printed or copied into reports. Current local environment checks include .env.local, not just the public .env file. Production-host configuration remains unverified.

## Final live checkpoint — 27 October, 11:42 AM Manila

DM-01-B01's wrong upper-bound interpretation was specifically diagnosed and rejected; its hint remained bounded and corrected computation passed. The session resumed after the local server stopped. Final interpretation was blocked by HTTP 429 at the shared 18/18 reservation limit. Saved progress is 75%, with four assessed responses, one assistance event, six accepted internal gates and interpretation pending. No solution, scorecard or final submission was fabricated; completed-session count remains 3. See set-builder-quota-blocked.json and the individual matrix.

Live completion summary: one newly completed question with two tutor-quality failures (QM-07-B01), one partially tested question blocked by quota (DM-01-B01), one earlier submission rechecked without a new replay (QM-08-B01), and 33 not tested live. All 36 source/database and assignment checks remain separately passing. No remote deployment, destructive migration, question import or history reset was performed. The next immediate action is to resume DM-01-B01 after the quota reset at 3:00 PM Manila October 27. Deployment remains blocked by the outstanding live matrix, tutor-quality findings, concept-preflight conflict, host/rollback verification and explicit authorization.

## Evening continuation — 27 October, 10:13 PM Manila

The quota-reset retry reached the provider twice, but Gemini returned 404 NOT_FOUND (app 503 ai-provider-404). This supersedes quota as the immediate blocker for DM-01-B01. Metadata GET/list still advertise gemini-2.5-flash-lite with generateContent; authenticated backend health and Firestore connectivity passed. Exact provider-side cause is unresolved, and no key/model/quota configuration was changed. Post-failure database verification confirms the same 75% progress and protected reference, with no scorecard or completion added. See the individual matrix and provider-blocker-evening.json for evidence. Live testing remains BLOCKED; nothing was remotely deployed.

## Model repair — October 27

Provider 404 cause established and locally resolved by replacing the unavailable gemini-2.5-flash-lite configuration with gemini-3.5-flash-lite, using the same key. Targeted tests 73/73, build, lint, bundle scan and live interpretation/scorecard/submission pass. DM-01-B01 is submitted with one persisted 100-point scorecard. See GEMINI_MODEL_FIX_2026-10-27.md. Remote rule failures and broader release blockers remain; nothing remotely deployed.
