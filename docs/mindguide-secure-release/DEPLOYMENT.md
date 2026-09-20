> Historical server-architecture document. Current implementation and deployment: [Spark operations](../SPARK_DEPLOYMENT.md). Functions-specific requirements below no longer apply to the Spark application.

# Controlled pilot: staging, migration, and release

Participant access defaults to closed. Use the Maintenance page for typed closed/open/drain/write-freeze controls and verified-UID cohort admission. Missing configuration never opens learning. A drain stops new sessions while allowing admitted learners to finish; a write-freeze stops learning mutations and content edits. Owner recovery remains accessible.

## Local verification

Use Node 22 and Java with `npm ci`, `npm run check`. `npm run dev` starts Auth, Firestore and Functions against `demo-mindguide`; local UI tests must not contact production. Rules and transaction tests run against `mindguide-test` on port 8086. Migration tests operate only inside that emulator and create ignored fixture backups.

## Closed staging

Create a separate Firebase project. Set `MINDGUIDE_TARGET_PROJECT` and `MINDGUIDE_STAGING_PROJECT` to its ID, and `MINDGUIDE_DEPLOY_MODE=closed-staging`. Provision a dedicated runtime service account, required APIs/billing, Auth providers/domains, Secret Manager `GEMINI_API_KEY`, production App Check and indexes. Use explicit project arguments throughout. Rotate previously exposed credentials.

1. Record a managed Firestore export and restore it into disposable staging. Record exact export location, restore operation, counts and checks; local JSON backups do not replace this evidence.
2. Inspect the source schema. For pre-v3 data run v3 dry-run/apply/verify to split public/private learning records. Then run v4 dry-run/apply/verify. v4 refuses pre-v3 sessions. Never use insecure prototype rules for rollback with access open.
3. Run `npm run migrate:v5 -- --project=<id>`. Review its proposed changes. Run the same command with `--apply`, save its exact backup path, then `npm run migrate:v5:verify -- --project=<id>`. Repeat apply; expect no changes.
4. v5 seeds 18 draft problems, their private answers and safe hints, draft prompt/reference records, and a draft rubric. No faculty decisions or study dates are invented. Existing submitted history and scores remain unchanged; older unfinished workflows are archived for read-only viewing.
5. Rehearse rollback with `npm run migrate:v5:rollback -- --project=<id> --backup=<exact-path>`. The script verifies project, backup hash and conflicting writes, and leaves access closed. Rerun the migration after the rehearsal.
6. Run `npm run build`, `npm run scan:bundle`, and `npm run release:preflight -- --project=<id> --closed-staging --output=<report-path>`.
7. Deploy the matched Functions/rules/indexes/Hosting candidate to closed staging. Functions and Hosting predeploy hooks run preflight. Wait for production index readiness and verify deployed rules/App Check; emulator success is insufficient.

## Faculty review and participant release

Review topic/difficulty designations, every distinct problem, canonical answer, assumptions, prompts, hints and supported notation. Prepare all dependent prompt/reference/topic/policy records before recording problem approval. Record the rubric review using `adminReviewPilotRubric` with the current version, faculty evidence reference/hash and calibration evidence. Approval manifests cover the exact instructional data; subsequent changes invalidate readiness.

Select enabled topic IDs while closed:

- `quantitative-methods-measures-of-central-tendency`
- `discrete-mathematics-counting-principles`

Each requires variants 1, 2 and 3 at Basic, Intermediate and Advanced. Keep unrelated topics disabled. Learner-entered problems accept only the documented mean/median/mode/product/permutation/combination grammar and confirmed givens; arbitrary proofs and ambiguous prose are rejected.

Configure `system_settings/privacy`: `currentConsentVersion`, `studyClosedAt`, `identifiableRetentionMonths`, `aiLogRetentionDays`, `sessionInactivityHours`, and `policyEvidenceReference`. Institutional approval is required. Retention uses the absolute study-closure cutoff; later account activity does not exempt it. Shortening AI retention also affects older records at the next cleanup. Lengthening does not extend an already earlier expiry. Stored learning records retained after identity cleanup are explicitly pseudonymous, not certified anonymous. Backup expiry and downloaded exports remain operator responsibilities.

Supply separate staging learner/admin credentials documented in `.env.example` and run `npm run test:e2e:staging`. Run complete learning and review journeys, changed consent, revoked admission, Google OAuth, password-reset delivery, mobile math input, keyboard navigation, poor network recovery and quota exhaustion. Capture faculty-labeled false acceptance/rejection and leakage evaluation. Live AI changes require regression evaluation.

Measure 50 simultaneous staging participants provisionally with the load harness. This is not an approved research sample. Record p50/p95 latency, failures, AI tokens/session and billed token prices, Firestore reads, and quota recovery. Functions emit `mindguide_ai_usage` records without learner text. Daily server request ceilings default to 500 starts and 5,000 AI calls; these are request ceilings, not currency spending caps. Configure Cloud Billing budgets, alerts, failed-retention/backlog alerts, and emergency drain/freeze ownership.

## Signed release evidence

`release:preflight` accepts an Ed25519-signed owner evidence envelope using `--evidence=<json>` and `--owner-key=<public-pem>`. The signed payload contains `projectId`, `artifactHash`, `commit`, and `evidence` entries with `reference` and `sha256` for:

`faculty_content`, `rubric_calibration`, `research_protocol`, `privacy_policy`, `billing_iam_secrets`, `app_check_rules_indexes`, `authenticated_staging`, `load_and_quota`, `backup_restore`, `migration_rollback`, `monitoring_and_budget`.

Sign the canonical JSON payload (recursively sorted object keys, array order preserved); encode the signature as base64. Do not generate placeholder approvals. Preflight hashes built frontend/Functions artifacts, rules/indexes and dependencies; it checks actual catalog manifests separately from owner attestations. The owner's signature attests evidence references; it does not independently authenticate their academic conclusions.

A successful participant preflight may register its artifact with `--register`. This is an explicit owner-side database write. Configure Functions `RELEASE_ARTIFACT_HASH` to that verified hash and redeploy the matching artifact. Use the Maintenance page to select its ID and open only to the verified roster. Any mismatch, missing evidence or unready topic blocks opening. `MINDGUIDE_OWNER_EVIDENCE` and `MINDGUIDE_OWNER_PUBLIC_KEY` supply predeploy evidence; no manual `MINDGUIDE_GATE_*` boolean is accepted.

## Rollback and incidents

On failure, drain or freeze, preserve evidence, restore the exact tested backup and matched artifact, verify counts and authorization, and keep access closed. Never silently roll back to browser-visible solutions. Privacy/deletion jobs and observed writes must finish or show failure before declaring cleanup complete. Investigate permanent write failures and backlog logs, and resume the same logical request instead of inventing success.

Local production-preview browser baseline: `npm run measure:browser` writes `.local-backups/browser-performance.json`. It measures three cold browser contexts for each public route on local Chromium. This is not authenticated staging or constrained-device/network evidence.
