# Finish MINDGUIDE as a Functional Local Capstone Pilot

## Delivery target

- Preserve the existing uncommitted implementation and finish it for one-computer `localhost` use with real Firebase Auth/Firestore and direct Gemini access.
- Support student accounts and one manually promoted global administrator.
- Make every visible control functional or remove it; never show success after a failed write; make active sessions reloadable and authorization-safe.

## Data and security

- Canonical roles: `student | admin`, with legacy `teacher` migration.
- Canonical lifecycle: `in_progress -> submitted -> reviewed | returned`, with legacy `completed` read/migration support only.
- Add schema versioning, explicit curated/free-form context, persisted hints, review identity/timestamps, linked retries, deterministic notifications, and exactly-once statistics.
- Commit Firestore rules/indexes and an idempotent dry-run/apply migration with a local ignored backup.
- Bound user input, AI output, session exchanges, and AI context.

## Product behavior

- Keep email/password, Google auth, reset, profile, theme, and sign-out flows with visible errors.
- Offer explicit guided-problem and own-problem modes. Complete the 11-topic x 3-difficulty curated matrix (33 problems) and provide validated free-form AI analysis/scoring.
- Persist and resume every session step through ID-based routes; make AI work idempotent and failure-aware.
- Commit status/stats only on explicit submission; support administrator review and one immutable linked retry after return.
- Finish in-app notifications/preferences, full printable/PDF logs, pagination/error states, accessible navigation, and mobile logic-map access.

## Verification

- Add TypeScript, lint, unit/UI tests, Firebase Emulator rules tests, Playwright E2E scaffolding, preview/check scripts, and patched dependencies.
- Gate release on typecheck, lint, tests, production build, dependency audit, bundle budget, Firestore authorization scenarios, lifecycle idempotency, and a localhost smoke test.

## Boundaries

- Controlled formative capstone pilot only; no public hosting, classroom assignment model, email delivery, official grading, account deletion, or production secret protection.
- Direct Gemini key and curated answers remain inspectable in the client and must be restricted, monitored, and rotated after the pilot.
- Ollama remains an optional local adapter; Gemini is the live acceptance provider.
