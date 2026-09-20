# Spark operations and deployment

## Runtime and trust model

The application uses Firebase Auth, Firestore, and Hosting in the project already configured in `.env`. It does not invoke Cloud Functions or any replacement application server. Free-plan quotas still apply; a quota or connectivity failure is shown as a database error, never as an empty catalog.

Scoring references are intentionally inspectable by authorized learners. New scores are local practice results, not trustworthy examination grades. The `spark-practice-v1` rubric uses typed mathematical correctness (25), accepted computation/verification evidence (25), method/justification plus relevant methodology (25), and understanding/interpretation plus relevant reflection (25). Unsupported mathematical inputs are rejected with feedback. Local prose checks are formative heuristics rather than AI semantic evaluation. All four categories and assistance evidence remain visible.

## Content readiness and conversion

1. Sign into the Firebase CLI with an operator authorized for the configured project. Alternatively use `GOOGLE_APPLICATION_CREDENTIALS`; never put an Admin credential in a `VITE_` variable.
2. Run `npm run migrate:spark`. Review the project ID, counts, and issues. Legacy approvals are checked against their saved instructional manifests; a missing or stale approval is reported, not replaced.
3. Run `npm run migrate:spark -- --apply` only after the dry run succeeds. Changed scoring documents are backed up in `.local-backups`. The migration is idempotent. It writes only `problem_scoring/{problemId}`, preserving original private documents, faculty decisions, and history.
4. Run `npm run release:preflight` to verify that published scoring documents match the real approved source. New in-app approvals publish scoring references and a content snapshot hash atomically.
5. An empty approved bank is a valid empty state. Learners need real faculty-approved questions before prepared practice can begin. Topic approval alone does not invent question availability.

Published fields are an explicit allowlist: answer specification, concepts, formulas/theorems and conditions, worked steps, final answer, interpretation, prompts, hints, and rubric metadata. Reviewer identities, raw AI logs, credentials, and other private fields are never copied. Each new session pins its own reference snapshot so subsequent edits do not change that session's scoring.

## Release checks

Run typechecking, lint, unit/component tests, production build, bundle scan, and `npm run test:rules`. The latter calls the Firebase Rules simulator with synthetic request contexts, not synthetic database records. No emulator project is created. Public-route browser tests run with `npm run test:e2e`; authenticated staging tests require separately supplied existing test accounts and must not create or seed data in the production project.

Deploy only:

```sh
firebase deploy --only firestore:rules,firestore:indexes,hosting --project socratic-ai-a7765
```

The Hosting predeploy gate checks scoring readiness using the same `.env` project. Apply matching rules/indexes before accepting learning writes. Firestore rules protect owner data, student-only profile creation, immutable attempts, content editing restrictions, and admin access. They do not make browser-calculated scores tamper-proof.

## Administration and maintenance

- Firebase Console → Authentication → Users handles account deletion and password resets. Application suspension/deactivation is stored in Firestore and immediately blocks protected data through rules; it does not claim to disable the underlying Auth account or revoke its refresh tokens.
- Existing administrators require both `role: admin` in their protected profile and an Auth custom claim. Firebase Console cannot edit custom claims: an already authorized operator must use their existing trusted Admin SDK process for claim changes. No browser promotion, credential download, or new hosted backend is supplied.
- Role changes must update both sources. Learners cannot promote themselves. Administrator account status changes remain an operator responsibility to avoid locking out the last admin.
- Cohort settings remain recordkeeping metadata. They do not block learning access or hide approved topics.
- Session inactivity is evaluated on session access and before resuming assignments. Expired work remains in history. There is no background scheduler and no promise of unattended expiry notifications.
- Retention and deletion are manual operator responsibilities. Review the configured privacy policy, then use Firebase Console to remove expired legacy AI logs and per-user operation records as appropriate. Account deletion does not automatically erase Firestore data. Review and remove/pseudonymize the relevant profile, consents, progress, notifications, and session identity fields as required by the actual policy. Do not state that cleanup occurred until verified.
- Existing legacy migration/seed scripts remain historical tools and are not part of Spark deployment. Do not run them to populate or approve this application's content.

## Retiring deployed services and rollback

Removing Functions from source does not delete an already-deployed function. An operator should inventory existing Functions and scheduled jobs in Firebase/Google Cloud Console and explicitly retire them after verifying the new release. Do not change billing automatically. No billing changes or legacy-service deletions are performed by the migration.

For a frontend rollback, use Firebase Hosting release history. Keep the new compatible rules unless the matching old application and its backend are also restored. A previous server-dependent frontend will not work merely by rolling back Hosting on Spark. Scoring-reference backups include before/after data; restore only the affected reference documents after verifying that their current values still match the recorded migration output. Never restore a demo database or overwrite original faculty approvals.
