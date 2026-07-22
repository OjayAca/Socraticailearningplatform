# MINDGUIDE Secure Release Progress

## Status: implementation complete; project-owner release gates pending

### Phase 1: Baseline and trusted backend — complete

- [x] Create `codex/mindguide-secure-release` and annotated `mindguide-v2-pilot-baseline` tag.
- [x] Add shared schema-v3 contracts and Functions Gen 2 workspace.
- [x] Implement all learner/admin callable authority plus idempotency, rate limiting, evaluation leases, App Check, secrets, custom claims, stable failures, and service-account configuration.

### Phase 2: Firestore schema and migration — complete

- [x] Public/private collections, restrictive rules, indexes, and authorization tests.
- [x] Split/seed all 33 curated problems.
- [x] Idempotent v3 dry-run/apply/verify/rollback with manifest, counts, legacy handling, and public-secret scan.

### Phase 3: learner workflow — complete

- [x] Nine-stage projection with seven server-owned reasoning gates and diagnosis after every response.
- [x] Corrective cycles, controlled support, administrator exception, math input/rendering/equivalence, evidence scorecard, abandonment/expiry, submission, retry, and adaptation.
- [x] Remove private solution and browser AI paths from the production bundle.

### Phase 4: administration and privacy — complete

- [x] System Administrator users, managed content, review, reports/export, logs, settings, and maintenance routes.
- [x] Versioned consent, raw-AI expiry, inactivity expiry, study-closure anonymization, and audit retention.

### Phase 5: local verification and documentation — complete

- [x] Typecheck, lint, 34 unit/Functions tests, 8 Firestore rules tests, production build, bundle scan, and public Playwright tests.
- [x] Remediate strict-hybrid reasoning, lifecycle replay, stale claims, administrator concurrency, anonymization, content leakage, reports/CSV, consent rotation, preferences, notifications, progress, and missing-record states.
- [x] README, architecture, data dictionary, deployment/rollback, verification traceability, research, and implementation plan.

## Project-owner gates — pending

- [ ] Enable billing/APIs and provision staging.
- [ ] Configure least-privilege IAM, App Check, Secret Manager, and credential rotation.
- [ ] Capture managed export/restore evidence and production baseline counts/configuration.
- [ ] Run staging migration twice, authenticated end-to-end smoke tests, and latency verification.
- [ ] Configure study-closure/privacy dates and approve the exact release tag.
- [ ] Deploy Functions, indexes, client, and restrictive rules from that tag; run production smoke tests.

No production deployment or cloud mutation was attempted without project-owner authority.
