# Controlled-pilot repair record

Status: software changes implemented; local verification recorded in [VERIFICATION.md](VERIFICATION.md). Isolated staging is not verified. Participant release is not approved. Faculty content/rubric decisions, institutional privacy and research requirements, and project-owner evidence remain blockers. No cloud deployment or participant admission was performed in this repair.

The user-approved scope covers software and release procedures. Manuscript editing is excluded. The audit document is evidence, not an independent authorization to change the manuscript or open access. Existing uncommitted work has been preserved.

## Review material

[PILOT_REVIEW_BANK.json](PILOT_REVIEW_BANK.json) contains the 18 distinct draft problems, private canonical references, phase prompts, and separately authored scaffolds. This is a faculty/administrator artifact; do not publish it in Hosting or learner-readable Firestore documents. There are nine problems per topic, three per difficulty. Four learner-visible stages and seven server-owned checks remain.

Rubric anchors are seeded by `scripts/migrate-v5.ts`; `adminReviewPilotRubric` records the faculty decision against an expected version with evidence references and a SHA-256 evidence hash. Approval must follow actual faculty review and calibration. Approved prompts, references, policies and rubric precede problem approval because they form part of its immutable manifest. Material changes require fresh approval for new sessions. Follow-ups require the original pinned manifest to remain current. Historical scorecards are unchanged; formal progress averages include only calibrated scorecards and show the excluded count.

## Audit disposition

“Fixed” means the software defect has an implementation and local regression coverage where listed; it does not certify cloud behavior or academic validity. “Externally blocked” identifies evidence that cannot be supplied by code. Supplemental staging tests are required for the exact release artifact.

| Audit | Disposition | Repair and remaining evidence |
|---|---|---|
| 1 False full accuracy | Fixed | Private typed canonical verification; rejects 100, -10, and negation against 10. |
| 2 Correct numeric rejected | Fixed | Plain and LaTeX equivalents; regression for variance 8. |
| 3 Methodology/reflection ignored | Fixed; calibration externally blocked | Response-linked four-criterion assessment, rubric version, independent assistance count; faculty calibration pending. |
| 4 Hints disclose solution | Fixed for initial bank | Separately authored phase scaffolds, all 18 problems and support levels checked; faculty pedagogical review pending. |
| 5 Unverified own problems | Fixed | Strict deterministic dataset/counting grammar, independent computation, input-bound givens confirmation. |
| 6 Missing prior reasoning | Fixed; live-provider evaluation externally blocked | Bounded prior reasoning and private conditions; malformed/contradictory outputs rejected, free-text AI guidance not passed to learner. |
| 7 English word count | Fixed | Computation phases accept mathematical structure. |
| 8 Duplicate bank | Fixed | 18 distinct draft problems across six topic/difficulty cells. |
| 9 Global catalog gate | Fixed | Explicit enabled topics, nine approved distinct problems each; disabled topics excluded. |
| 10 Stale approval | Fixed | Content hash manifests and immutable faculty decisions, checked for starts, follow-ups and release. |
| 11 Inconsistent adaptation | Fixed | Pinned policy and configured sample size. |
| 12 Unsubmitted adaptation data | Fixed | Submitted topic-specific calibrated evidence; assisted follow-ups distinguished. |
| 13 Duplicate diagnoses | Fixed | Distinct-session evidence, deduplicated category counts. |
| 14 Shutdown ineffective | Fixed; deployed rules externally blocked | Closed/open/drain/write-freeze checks on server and rules. |
| 15 No cohort admission | Fixed; roster externally blocked | Administrator roster bound to verified Auth UID; email verification actions added to profile. Google and email/password staging journeys pending. |
| 16 Identifiers retained | Fixed for modeled linked records | Purge replaces profiles/session summaries and removes raw linked records; retained linked summaries explicitly pseudonymous. Institutional review pending. |
| 17 Retention ineffective | Fixed; approved settings externally blocked | Current configured cutoffs, study closure and durable cleanup jobs. |
| 18 Backlogs/indexes | Fixed; deployed indexes externally blocked | Bounded pages, progress/failure records and required collection-group indexes. |
| 19 Expiry race | Fixed | Transaction rereads latest status/activity; emulator interleaves a concurrent update. |
| 20 Ignored bulk failures | Fixed | Every BulkWriter promise observed; permanent failure propagates; full cloud fault rehearsal pending. |
| 21 Partial account deletion | Fixed | Durable bound deletion job and retry after Auth deletion; linked-data purge tested locally. |
| 22 Content deletion audit gap | Fixed | Tombstone job precedes deletion, resumable completion and audit. |
| 23 Stale draft after scoring failure | Fixed | Saved revision adopted before scoring; retry keeps persisted draft. |
| 24 New IDs on retry | Fixed | Persisted request/input snapshot, fingerprint-bound idempotency and recoverable assignment reservation. |
| 25 Lost learning evidence | Fixed | Draft/response persistence, diagnosis and support history, shared safe math rendering. |
| 26 Zero response counts | Fixed | Transactional canonical responseCount and migration backfill. |
| 27 Incomplete reports | Fixed | Full filtered population, event-specific dates, Manila day boundaries, cursors/completeness, population-change detection; 1,200-row emulator regression. |
| 28 Consent bypass | Fixed | Follow-ups share current-consent and admission transaction checks. |
| 29 Migration order | Fixed; cloud rehearsal externally blocked | Verify v3 security conversion before v4/v5; legacy unfinished history archived without rescoring; exact-backup rollback and second-apply emulator rehearsal. |
| 30 Manual preflight flags | Fixed; signed evidence externally blocked | Artifact/project binding, catalog/privacy machine checks and signed owner evidence; separate closed staging deployment gate. |
| 31 Incomplete end-to-end evidence | Externally blocked | Expanded local regression/rules/transaction/migration coverage; authenticated staging, provider adversarial cases and fault-boundary rehearsal still required. |
| 32 Dependency advisories | Externally blocked for upstream residual advisories | Compatible updates applied; production audit has no high/critical at last check, moderate transitive advisories remain. Recheck exact lockfile before release. |
| 33 Browser/load performance | Externally blocked | Production bundle measured by build; staged 50-account harness added. Local public-page Chromium baseline recorded; study-device/network timings, quotas, poor-network recovery and load evidence pending. No unmeasured optimization claim. |
| 34 Respondent count | Outside delivery; release blocker | Faculty must reconcile protocol/sample. Fifty concurrent users is only an engineering target. |
| 35 Questionnaire timing | Outside delivery; release blocker | Academic owner must approve instrument and post-use protocol. |
| 36 Scorecard manuscript | Outside delivery; release blocker | Four criteria retained in software; manuscript/rubric consistency requires faculty action. |
| 37 Release/scoring manuscript | Outside delivery; release blocker | Software scores before solution release; manuscript reconciliation excluded. |
| 38 Database manuscript | Outside delivery; release blocker | Repository data dictionary updated; manuscript diagrams remain academic work. |
| 39 Architecture claims | Outside delivery; release blocker | Repository architecture documents current boundaries; academic claims need owner review. |
| 40 Missing academic artifacts | Externally blocked | Faculty validation, protocol and consent evidence not supplied. |
| 41 Effect/competitive claims | Outside delivery; release blocker | No effectiveness inference from software checks or load simulation. |
| 42 Proposal/final reconciliation | Outside delivery; release blocker | Manuscript editing excluded by user. |

## Acceptance limits and remaining staging work

Local tests do not establish inter-rater reliability, real AI grading quality, Google OAuth/inbox delivery, cloud IAM, billing, secret access, App Check enforcement, index deployment, quotas or restoration. The staging credential preflight currently lacks the dedicated URL and separate learner/admin credentials. No institutional retention dates, approved cohort or signed faculty/owner evidence has been fabricated.

Run the single [deployment and rollback runbook](DEPLOYMENT.md) with an explicit isolated project. Rehearse legacy conversion, apply, verify, second apply and exact-backup rollback; repeat after restoration. Exercise authenticated learner/admin journeys, actual model malformed/injection cases, lost responses, multi-tab drafts, scoring failure, write failures at each lifecycle boundary and multi-page cleanup. Capture 50-concurrent-account results plus poor-network/quota scenarios and browser timings before selecting bundle optimizations. Register signed external evidence only against the exact project and final artifact. Keep participant admission closed until all gates pass.

The local report implementation scans bounded Firestore pages and aggregates the entire selected population. It retains that population in callable memory; larger-than-pilot studies require measured memory/runtime limits or a durable export job. Export cursors detect intervening data changes and require a restart rather than returning a mixed population.

Client drafts and pending operations are retained in session storage per account and cleared on sign-out; closing the tab ends that local recovery window. Privacy cleanup covers modeled links; pseudonymous retained scores remain linkable and must remain under institutional retention/access controls.
