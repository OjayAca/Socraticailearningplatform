# Verification and Traceability

## Automated evidence (2026-07-18)

| Gate | Result |
|---|---|
| Shared/client/Functions typecheck | Pass |
| ESLint | Pass |
| Client and migration unit tests | 24 pass |
| Functions workflow/security tests | 10 pass |
| Firestore authorization suite | 8 pass |
| Production build | Pass |
| Browser private-material scan | Pass: 15 assets, 9 markers, 307 curated private strings |
| Public Playwright suite | 2 pass; 2 live-credential tests intentionally skipped |
| Production dependency audit | No high or critical; 7 moderate inherited through Firebase Admin storage dependencies |

## Implemented roadmap coverage

- Trusted Gen 2 callables, App Check enforcement, Secret Manager, custom claims, stable errors, UUID idempotency, rate limits, per-session evaluation lease, and configurable least-privilege runtime identity.
- Canonical nine-stage contracts, seven transactional strict-hybrid reasoning gates, full diagnosis record, corrective cycles, controlled support, deterministic math validation, evidence scorecard, exactly-once statistics, and two-session topic adaptation.
- Public/private Firestore split, deny-by-default rules, indexes, 33-problem migration seed, schema-v3 dry-run/apply/verify/rollback, legacy-history preservation, and secret-field verification.
- MathLive/KaTeX learner input and server Compute Engine parsing/equivalence.
- System Administrator users, content, reviews, audited exceptions, reports/CSV, audits/AI failures, settings, and maintenance views.
- Versioned consent, 90-day raw-AI cleanup, inactivity expiry, study-closure anonymization, and audit retention.
- Secure-release remediation covers immutable terminal sessions, revisioned submission, stale-claim denial, active-account rules, complete anonymization, private-content validation, report discrimination, CSV neutralization, dynamic consent, canonical progress, and explicit missing-record states.

## External evidence still required

The repository cannot prove project-owner operations. Attach screenshots/logs for billing/API enablement, staging project/location, service-account IAM, App Check registration/enforcement metrics, secret version, rotated old credential, managed export/restore, staging migration twice, staging smoke tests, configured privacy dates, production latency, and final tagged deployment.

Live end-to-end authenticated workflow coverage must run in staging with deterministic fake AI or controlled test credentials before release. The local public suite does not substitute for that evidence.
