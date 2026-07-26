# MINDGUIDE Secure Release Implementation Map

| Work package | Primary implementation | Evidence |
|---|---|---|
| WP-01 security | `functions/src/runtime.ts`, `security.ts`, `errors.ts`, `firestore.rules` | Rules suite, callable validation, App Check/secret configuration |
| WP-02–08 learning engine | `contracts`, `sessions.ts`, `workflow.ts`, `math.ts`, `ai.ts`, secure learner components | Functions tests, typecheck, production scan |
| WP-09 administration | `admin.ts`, `SecureAdmin.tsx` | Claims, final-admin protection, version/audit transactions |
| WP-10 schema | Rules, indexes, public/private document layout | Data dictionary and emulator tests |
| WP-11 privacy | Consent UI/callable, `privacy.ts`, report export audits | Scheduled retention and settings |
| WP-12 migration | `migrate-v3.ts`, `migration-v3-core.ts` | Unit tests, dry-run/apply/verify/rollback runbook |
| WP-13 release | Bundle scan, Playwright production preview, docs | Verification and deployment checklists |
| Schema-v4 capstone alignment | `configuration.ts`, academic-profile/catalog callables, typed managed-content UI, faculty-validation workflow, 99-record seed, migration-v4, release preflight | Schema-v4 tests, rules, readiness report, manuscript amendment guide |

## Key compatibility choices

- Completed v2 records remain immutable history.
- Unfinished v2 records become archived/abandoned and restart as linked v3 sessions.
- New session documents retain limited non-sensitive display compatibility fields for existing presentation code, but only callables write them.
- Legacy route URLs redirect to current System Administrator or secure session routes; they do not restore legacy authority.

## Definition-of-done boundary

Repository implementation is complete when code, rules, indexes, migration behavior, automated evidence, and documentation agree. Evaluation release is complete only after the separate project-owner gates in `DEPLOYMENT.md` are evidenced in staging and production.

Schema v4 intentionally separates software completion from academic approval. The migration creates 33 validation-pending first variants and 66 clearly marked faculty-validation drafts. These records cannot enter the learner catalog until their protected solutions and external validation evidence are reviewed and recorded. No generated draft is represented as academically validated.
