# Staging, Migration, Release, and Rollback

Production deployment is intentionally blocked until every project-owner checkbox below is evidenced.

## One-time project setup

- [ ] Enable billing, Functions Gen 2, Cloud Build/Run, Artifact Registry, Eventarc, Scheduler, Secret Manager, App Check, and required Firebase APIs.
- [ ] Create a separate staging Firebase project using the same Firestore location as production.
- [ ] Confirm `FUNCTIONS_REGION` is supported and near that Firestore location; record staging p95 callable latency.
- [ ] Create a dedicated Functions service account. Grant only datastore access required by these functions, Secret Manager access to `GEMINI_API_KEY`, logging, and invocation/runtime roles required by Gen 2. Set `FUNCTIONS_SERVICE_ACCOUNT` in `functions/.env.<project-id>`.
- [ ] Register the production web app with reCAPTCHA Enterprise App Check and configure `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`. Debug tokens are emulator-only.
- [ ] Store Gemini in Secret Manager: `firebase functions:secrets:set GEMINI_API_KEY --project <id>`.
- [ ] Rotate the credential that was previously available to browser code.
- [ ] Set `system_settings/privacy.currentConsentVersion`, `sessionInactivityHours`, `studyClosedAt`, and `identifiableRetentionMonths`.

## Baseline evidence

The prototype rollback point is the annotated tag `mindguide-v2-pilot-baseline`. Before cutover, record deployed Hosting/Functions/rules/index versions, collection counts, rules-test output, configuration, and a managed Firestore export. Verify restoration into a disposable project.

## Staging rehearsal

```bash
npm ci
npm run check
firebase use <staging-project>
npm run migrate:v3 -- --project=<staging-project>
npm run migrate:v3 -- --apply --project=<staging-project>
npm run migrate:v3:verify -- --project=<staging-project>
firebase deploy --only functions,firestore:rules,firestore:indexes,hosting --project <staging-project>
```

Smoke-test registration/consent, a curated and supported free-form problem, all seven gates and corrective cycles, URL/revision bypass denial, controlled support, math keyboard/mobile input, scorecard evidence, exactly-once submission, returned follow-up, admin users/content/reports/export/audits/settings, unauthorized routes, and retention configuration.

## Production maintenance window

1. Enable maintenance mode and stop new session starts.
2. Deploy additive Functions and indexes; wait for index readiness.
3. Create and record a managed Firestore export.
4. Run v3 dry-run and review its manifest/counts.
5. Run v3 apply once, then verify. A second apply must report zero changes.
6. Confirm submitted/reviewed/returned v2 history is preserved, unfinished v2 is archived, and no forbidden public keys remain.
7. Deploy v3 client and restrictive rules from the exact approved Git tag.
8. Run production smoke tests and bundle scan evidence, then reopen access.

## Migration rollback

The apply command prints its exact backup path. Use that path only:

```bash
npm run migrate:v3:rollback -- --backup="migration-backups/<backup>.json" --project="<project-id>"
```

If migration verification or smoke testing fails, keep maintenance mode active, redeploy the baseline client/rules, restore the managed export, verify counts and sign-in, and record the incident. Do not partially hand-edit migrated documents.

## Approval gate

Release only when local/staging gates pass, no critical security/data-integrity/progression defect remains, the production dependency audit has no high/critical finding, privacy dates are configured, the managed export is restorable, and documentation traceability is signed off. Tag and deploy Functions, rules, indexes, and frontend from the same commit.
