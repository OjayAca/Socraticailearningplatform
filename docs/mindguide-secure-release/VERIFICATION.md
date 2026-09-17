# Current controlled-pilot verification

The v5 repair and release blockers are tracked in [PILOT_V5_REPAIR.md](PILOT_V5_REPAIR.md). Earlier entries below are historical evidence, not current readiness claims. The 99-record gate and profile-renaming anonymization claims are superseded by v5.

# Verification and Traceability

## Dependency security remediation (2026-08-23)

The dependency gate was refreshed without major-version upgrades or application
behavior changes:

- `react-router` 7.18.2, `firebase-admin` 14.3.0,
  `firebase-functions` 7.3.2, and `firebase-tools` 15.28.1.
- Patched transitive releases include `fast-xml-parser` 5.11.0, Hono 4.13.3,
  `@hono/node-server` 1.19.17, `fast-uri` 3.1.6, `ip-address` 10.5.0,
  and the applicable `brace-expansion` 1.1.18, 2.1.4, and 5.0.9 lines.
- The complete dependency tree reports 0 critical, 0 high, and 12 moderate
  advisories. The production-only audit reports 0 critical, 0 high, and 7
  moderate advisories inherited through Firebase Admin storage dependencies.
  npm offers only a breaking Firebase Admin downgrade for those residual findings,
  so they remain documented rather than force-fixed.
- `npm run audit:prod` now enforces the no-high/no-critical production gate and is
  included in `npm run check`.

Post-upgrade verification passed: shared/client/Functions typecheck, ESLint,
dead-code analysis, 82 client/unit/migration/component tests, 28 Functions tests,
9 Firestore authorization tests, production build, private-material bundle scan,
and 6 public Playwright tests. All current callable and scheduled exports loaded in
the Functions emulator. The 11 credential-dependent or manual browser tests remain
outside the local gate.

## Supporting-feature audit evidence (2026-08-08)

The complete local gate passed after the minor-feature audit:

| Gate | Result |
|---|---|
| Shared/client/Functions typecheck | Pass |
| ESLint and dead-code analysis | Pass |
| Client, unit, migration, and component tests | 80 pass across 19 files |
| Functions workflow/security tests | 28 pass across 6 files |
| Firestore authorization suite | 8 pass, including display-name and bounded-preference assertions |
| Production build | Pass; existing large-chunk advisory remains non-blocking |
| Browser private-material scan | Pass: 27 assets, 9 markers, 307 curated private strings |
| Public Playwright suite | 6 pass |
| Authenticated staging Playwright suite | Not run: dedicated staging URL and student/admin secrets were not supplied |

Direct component coverage now includes authentication/password recovery, protected
route recovery and cross-role redirects, student profile/settings/achievements,
notifications, history/review/follow-up behavior, scorecard presentation, and
administrator users/reports/announcements/progress/logs/settings/review safeguards.

The audit remediated two supporting-feature defects without changing the Socratic
solver or its server workflow:

- Login and signup labels are now programmatically associated with their fields.
- Administrator user, progress-detail, logs, and settings screens now surface failed
  Firebase reads instead of retaining a spinner, silently rendering empty data, or
  producing an unhandled rejection.

`npm run test:e2e:staging` now requires a dedicated deployment URL and separate
student/admin accounts before Playwright starts. The preflight rejects missing values,
duplicate accounts, invalid URLs, and the known `socratic-ai-a7765` host. With secrets
present, the suite checks both role surfaces and restores its reversible student-status
change. Google OAuth and password-reset inbox delivery remain manual staging checks.

## Automated evidence (2026-07-24)

| Gate | Result |
|---|---|
| Shared/client/Functions typecheck | Pass |
| ESLint | Pass |
| Client and migration unit tests | 35 pass |
| Functions workflow/security tests | 20 pass |
| Firestore authorization suite | 8 pass |
| Production build | Pass |
| Browser private-material scan | Pass: 17 assets, 9 markers, 307 curated private strings |
| Public Playwright suite | 2 pass; 2 live-credential tests intentionally skipped |
| Production dependency audit | No high or critical; 7 moderate inherited through Firebase Admin storage dependencies |

## Implemented roadmap coverage

- Trusted Gen 2 callables, App Check enforcement, Secret Manager, custom claims, stable errors, UUID idempotency, rate limits, per-session evaluation lease, and configurable least-privilege runtime identity.
- Canonical four-stage contracts backed by seven transactional strict-hybrid reasoning gates, full diagnosis records, adaptive prompt scaffolding, controlled support, deterministic math validation, score-before-solution release, four-part evidence scorecards, exactly-once statistics, and two-session topic adaptation.
- Public/private Firestore split, deny-by-default rules, indexes, 33-problem migration seed, schema-v3 dry-run/apply/verify/rollback, legacy-history preservation, and secret-field verification.
- Schema-v4 academic-profile gate, dynamic catalog, version-pinned managed configuration, non-repeating assignment state, immutable faculty-validation evidence, 99-record draft bank, typed administrator forms, and v4 dry-run/apply/verify/rollback.

## Schema-v4 release evidence

```bash
npm run migrate:v4 -- --project=<staging-project>
npm run migrate:v4 -- --apply --project=<staging-project>
npm run migrate:v4:verify -- --project=<staging-project>
npm run release:preflight -- --project=<staging-project> --output=preflight.json
```

Historical v4 preflight is superseded. Current preflight requires nine distinct approved problems for each explicitly enabled topic, matching content manifests, complete reviewed configuration, approved retention settings and signed artifact-bound owner evidence. Draft count is never academic approval.
- MathLive/KaTeX learner input and server Compute Engine parsing/equivalence.
- System Administrator users, content, reviews, audited exceptions, reports/CSV, audits/AI failures, settings, and maintenance views.
- Versioned consent, 90-day raw-AI cleanup, inactivity expiry, study-closure anonymization, and audit retention.
- Secure-release remediation covers immutable terminal sessions, revisioned submission, stale-claim denial, active-account rules, pseudonymous retention (v5 supersedes earlier anonymization terminology), private-content validation, report discrimination, CSV neutralization, dynamic consent, canonical progress, and explicit missing-record states.

## External evidence still required

The repository cannot prove project-owner operations. Attach screenshots/logs for billing/API enablement, staging project/location, service-account IAM, App Check registration/enforcement metrics, secret version, rotated old credential, managed export/restore, staging migration twice, staging smoke tests, configured privacy dates, production latency, and final tagged deployment.

Live end-to-end authenticated workflow coverage must run in staging with deterministic fake AI or controlled test credentials before release. The local public suite does not substitute for that evidence.

## Controlled-pilot local evidence (2026-09-09)

These results apply to the local working tree. There is no verified staging deployment or participant approval.

| Check | Observed result |
|---|---|
| Contracts, client and Functions typecheck | Pass, including the latest lease and cleanup changes |
| ESLint | Pass |
| Dead-code check | Pass, including the registered browser-measurement script |
| Client/component/migration unit tests | 102 passed |
| Functions tests | 42 passed |
| Firestore rules, transaction and migration integration | 19 passed |
| Migration rehearsal | Insecure v2 rejected; v4 history preserved; 18 draft problems seeded; second apply no changes; exact-manifest rollback passed in emulator |
| Report population | 1,200 sessions, complete cursor export; uncalibrated averages excluded |
| Privacy failure recovery | Permanent nested-delete failure, resume across 105 sessions and 300 notifications; assignment reservations removed |
| Idempotency takeover | Stale worker business writes fail atomically after lease replacement |
| Production build | Pass; Vite reports large chunks |
| Browser private-material scan | 27 assets, 14 markers and 357 curated private strings checked; pass |
| Public Playwright | 6 passed |
| Authenticated/provider Playwright | 11 skipped; not passing evidence |
| Staging preflight | Blocked: dedicated URL plus separate learner/admin email/password secrets missing |

Production build before the final dependency refresh: entry JavaScript 1,035.97 kB (278.57 kB gzip); session chunk 837.03 kB (231.66 kB gzip). Do not infer usable performance on study devices from compressed sizes alone.

`npm run measure:browser` measured the production preview in local Windows Chromium, with three fresh contexts per route and no network throttling. Median first-contentful-paint: landing 1,756 ms; login 952 ms; signup 1,128 ms. Median DOM-content-loaded: 1,193.5 / 443.4 / 670.5 ms respectively. Resource transfer was approximately 711–717 kB per route. Raw evidence is in `.local-backups/browser-performance.json`. These public-page loopback observations are not authenticated learning, slow-device, quota or 50-concurrent-participant evidence.

The final compatible dependency refresh resolved the Hono finding. The subsequent complete `npm run check` passed: 102 client tests, 42 Functions tests, 19 emulator tests, production build, bundle scan and six public-browser tests. Eleven live-authentication/provider checks were skipped. The production audit reported zero high/critical and nine moderate findings (qs/Express and uuid via Firebase Admin storage dependencies). These are observed September 9 results, not a claim that future advisory databases will remain unchanged. Never apply the suggested Firebase Admin downgrade automatically.

No faculty decisions, institutional policy, cloud screenshots, identity credentials or owner signatures were generated as substitutes for missing evidence. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the controlled staging and release sequence.

## Cloud inspection (2026-09-14; read-only)

The user supplied `socratic-ai-a7765` as the application project. Authenticated Firebase project discovery also found the existing `mindguide-stg-ojay-0823` project, named MINDGUIDE Dashboard Staging. This inspection made no cloud configuration, data, admission or deployment changes.

| Observation | Result |
|---|---|
| Firebase CLI account access | Project listing succeeded |
| Application project v5 pilot settings | `system_settings/pilot` does not exist |
| Application privacy settings | Exist; configured field names were inspected without printing values or identifiers |
| Staging Functions | No deployed functions |
| Staging Firestore | Default native database, `asia-southeast1` |
| Staging data | Two users, two sessions, zero problems; counts only, no participant content printed |
| Staging v5 pilot/privacy settings | Both absent |
| Staging billing | Cloud Billing API reports `billingEnabled: false` |
| Staging database protection | Delete protection enabled; point-in-time recovery disabled |

Cloud Functions deployment and authenticated cloud rehearsal remain blocked by staging billing and the missing test credentials/owner configuration. Existing staging data must be inventoried and backed up before migrations. The supplied application project remains excluded from mutating staging tests; a Hosting preview alone does not isolate its Auth or Firestore data. Current cloud participant availability has not been certified: the new closed-by-default controls exist in the repaired local software and have not been deployed.
