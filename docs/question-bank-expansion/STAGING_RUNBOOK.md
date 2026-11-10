# Question-bank staging runbook

**Current status: BLOCKED.** The local application and operator configuration both select `socratic-ai-a7765`. No independently verified staging target, account key, deployment or owner marker was available. No Firebase commands below were run against a remote target during this work.

## Configuration inventory

| Location | Use |
|---|---|
| `.env`, `.env.local` | The existing Vite web project and server project both resolve to `socratic-ai-a7765`. The staging check also excludes project IDs in Next development, test and production env files and the operator process. |
| `.env.example`, `next.config.mjs`, `src/lib/firebase.ts` | The example declares placeholders. Next forwards explicit public variables or the legacy Vite values into the browser build. Web Auth and Firestore share the configured browser app. |
| `server/config.ts`, `server/firebase.ts`, `server/auth.ts` | The server checks web/server project equality, initializes project-specific Admin credentials and verifies token audience and issuer. |
| `firebase.json`, `firestore.rules`, `firestore.indexes.json` | Rules and index file selection. No staging project mapping here, no repository `.firebaserc` alias. The `.firebase` file is a hosting asset cache. |
| `scripts/migrate-v2.mjs`, `migrate-v3.ts`, `migrate-v4.ts`, `migrate-p1.ts`, `migrate-spark.ts`, `migrate-curriculum.ts`, `reset-learning-data.ts` | Existing migration or maintenance commands use configured IDs, environment or explicit CLI targets. They are outside the expansion workflow. |
| `scripts/ai-health.ts`, `ai-preflight.ts`, `audit-core-features.ts`, `configure-operator-pilot.ts`, `admit-pilot-operator.ts`, `prepare-ai-notice.ts`, `test-spark-rules.ts`, `verify-question-bank-session.ts`, `import-question-bank.ts` | Existing application/operator project consumers. The legacy importer rejects applying expansion IDs before initializing Firebase. |
| `scripts/stage-question-bank.ts`, `scripts/lib/staging-target.ts`, `scripts/migrate-v5.ts` | Both the expansion command and the legacy staging migration require the separately verified target. The legacy sample-content apply remains retired. |
| `playwright.config.ts`, `scripts/verify-staging-e2e.mjs`, `scripts/staging-browser-setup.ts`, `app/api/staging-identity/route.ts` | Credentialed or remote Playwright runs verify the owner-approved HTTPS origin, compiled browser project, live backend project, database and marker before tests start. The identity route is disabled by default. |

## Provisioning required from the owner

1. Select an independently owned non-production Firebase project and its native Firestore `(default)` database. Verify the project ID and project number in the owner’s cloud inventory and record the evidence, reviewer, verification expiry, deployment URL and absence of production learner data. A project name, DNS alias or successful login alone does not establish isolation.
2. In that separate environment, provide the approved two-subject, 12-topic catalog with all 12 topics enabled and exactly the 36 approved originals, using the existing 468 content, private, scoring and approval records. Preserve real approval evidence. The expansion command checks this baseline and does not provision it. Restrict access to dedicated staging identities. Configure the reviewed rules and indexes there under separate authorization. Keep the application workspace's production configuration in place.
3. Provide a project-owned service account with staging-only database read/write access and no production IAM grants. Keep its key in operator-controlled storage outside the repository and outside synchronized folders. Pass its absolute path via `MINDGUIDE_STAGING_CREDENTIAL_FILE`. This command does not fall back to ADC or the developer’s Firebase CLI session.
4. Generate a verification UUID outside the importer. In the independently verified database, have the owner create `system_settings/staging_verification` with string fields `classification` equal to `non-production`, `projectId`, `database` equal to `(default)`, `verificationId` and `origin`. The origin is the exact HTTPS origin without a trailing slash. Revoke that marker to stop subsequent transactions.
5. Store the matching attestation in the ignored local file `.mindguide-staging/verification.json`. Use actual values in place of the placeholders. The importer rejects this illustrative template.

```json
{
  "classification": "non-production",
  "projectId": "<verified project ID>",
  "database": "(default)",
  "verificationId": "<owner-generated UUID>",
  "verifiedBy": "<actual verifier>",
  "evidenceReference": "<actual owner inventory or change record>",
  "expiresAt": "<future UTC timestamp in ISO 8601 format>",
  "origin": "https://<owner-verified staging deployment>"
}
```

6. Configure the separate staging deployment to use its own Firebase web app at build time, its corresponding server credentials at runtime, and the verification UUID as `MINDGUIDE_STAGING_VERIFICATION_ID`. The public identity response contains only deployment identity. Issue dedicated staging student and active administrator accounts, with the documented role, claims, consent and pilot admission as appropriate. Review data handling and any tutoring-provider enablement with the owner before authenticated checks.

## Inspect, apply, resume and roll back

Run from the repository root in the operator workspace. Use one batch ID for the lifetime of an import. Only the pinned 84-file and the pinned original baseline are accepted. Keep the inspect output and have the owner review the exact project and impact before any mutation.

```powershell
$env:MINDGUIDE_STAGING_PROJECT_ID = '<verified project ID>'
$env:MINDGUIDE_STAGING_CREDENTIAL_FILE = '<absolute key path outside repository>'
$batch = '<unique batch ID>'
node --import tsx scripts/stage-question-bank.ts inspect $batch
```

Inspect should show 924 missing content documents for a new batch. The two groups each contain 42 whole questions, or 462 content documents. A group has 42 problem documents, 84 private documents, 42 instructional references and 294 prompts. Its two additional writes maintain the batch manifest and its receipt. The original importer's 480-document guard remains in place.

After explicit authorization for that project and batch:

```powershell
$env:MINDGUIDE_CONFIRM_ACTION = "apply/$env:MINDGUIDE_STAGING_PROJECT_ID/$batch"
node --import tsx scripts/stage-question-bank.ts apply $batch
Remove-Item Env:MINDGUIDE_CONFIRM_ACTION
node --import tsx scripts/stage-question-bank.ts inspect $batch
```

**Recovery.** After an interruption or lost acknowledgement, inspect the same batch. An import transaction creates each content document and its receipt together. Only an intact, structurally identical content record with the same creation and update version as the receipt is owned by that run. Use the same authorized command and batch ID to continue. Any unexpected path, missing owned document, version change, validation, scoring reference or learner dependency stops the run. Reapplying a complete batch makes no content writes. A rolled-back batch ID stays retired.

**Manifest and audit.** `question_bank_imports/{batchId}` holds target, database, verification ID, pinned source digest, counts, every planned document path, status and the original-version fingerprint. Immutable event documents under `events/create-0`, `create-1`, `rollback-0` and `rollback-1` identify exact paths and commit times. The operator's ignored `.mindguide-staging/audit/<attempt-uuid>.json` captures previews, successful inspections or failures with attempted paths. If the connection and verified manifest are available, failed content attempts also appear under `failures/{attemptId}`. A failed preflight creates no batch manifest. For an ambiguous commit, inspect the receipts before retrying.

**Rollback.** Preview in the same isolated target. Compare the listed paths with the create receipts and the expected impact. A reviewed or edited draft, a same-data rewrite, a foreign document, a dependent session, an added private child or a changed original baseline blocks deletion. An interrupted rollback resumes from its rollback receipts.

```powershell
node --import tsx scripts/stage-question-bank.ts rollback-preview $batch
# Only after reviewing that output and obtaining rollback authorization
$env:MINDGUIDE_CONFIRM_ACTION = "rollback/$env:MINDGUIDE_STAGING_PROJECT_ID/$batch"
node --import tsx scripts/stage-question-bank.ts rollback $batch
Remove-Item Env:MINDGUIDE_CONFIRM_ACTION
node --import tsx scripts/stage-question-bank.ts rollback-preview $batch
```

A completed rollback returns `rolled_back` with no remaining deletion paths. The command rereads all 924 content paths, verifies the original 468 versions and preserves the manifest and audit trail. The operator must retain the audit files even if the database connection fails.

## Remote acceptance still outstanding

On the verified target, confirm the original baseline, inspect, rehearse interruption and rerun, verify 84 drafts and 120 total questions, and prove zero draft assignments with approved originals available. Exercise the student API and direct Firestore read restrictions with real scoped roles, including private children, instructor review controls and gated solution release. Use staging-specific browser credentials and `MINDGUIDE_E2E_BASE_URL` with `npm run test:e2e:staging`. Run the rules simulations against an explicitly verified staging target in a separate staging-configured operator workspace. The default rules script in this checkout reads the application’s production ID. Complete rollback rehearsal before any faculty decision changes an imported draft. Independent academic review and explicit production authorization are separate later decisions.
