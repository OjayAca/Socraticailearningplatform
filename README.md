# MINDGUIDE

MINDGUIDE is a secure, formative reasoning platform for Quantitative Methods and Discrete Mathematics capstone acceptability evaluation. It guides learners through evidence-producing reasoning gates before controlled solution support and a five-criterion critical-thinking scorecard. It is not an official grading system and does not claim permanent improvement in critical thinking.

## Secure architecture

- React renders learner-safe projections and sends bounded input to callable APIs.
- Firebase Functions Gen 2 owns problem validation, progression, diagnosis, support, scoring, adaptation, statistics, notifications, administrative mutations, retention, and anonymization.
- Firebase Auth custom claims are the role authority (`student` or `admin`). App Check is enforced outside the emulator.
- Firestore separates public learning records from private references, evaluator configuration, raw AI interactions, rate limits, and audit evidence.
- Gemini runs only in Functions with `GEMINI_API_KEY` stored in Secret Manager. The production-bundle scan rejects client AI code and known private instructional material.
- MathLive provides keyboard input, KaTeX renders notation, and CortexJS Compute Engine performs server-side parsing and equivalence checks.

The nine learner-visible stages are problem understanding, relevant-information identification, method selection, formula/theorem justification, guided computation or proof, verification, interpretation, controlled solution release, and the critical-thinking scorecard. Diagnosis runs after each response rather than appearing as a separate stage.

## Workspaces

- `packages/contracts`: canonical schema-v3 types and workflow order.
- `functions`: trusted Gen 2 callables and scheduled retention.
- `src`: React learner and System Administrator interfaces.
- `scripts/migrate-v3.ts`: dry-run/apply/verify/rollback migration.
- `tests`: unit, migration, rules, and Playwright coverage.
- `docs/mindguide-secure-release`: architecture, data dictionary, deployment, verification, and progress evidence.

## Local verification

Requires Node.js 22, Java for the Firestore emulator, and Firebase CLI.

```bash
npm install
copy .env.example .env
npm run check
```

Useful focused commands:

```bash
npm run typecheck
npm run lint
npm run test
npm run test:rules
npm run build
npm run scan:bundle
npm run test:e2e
```

Automated AI tests use deterministic logic and fixtures. Live Firebase sign-in tests run only when their documented environment credentials are supplied.

## Schema-v3 migration

Migration is dry-run by default and requires an authenticated Admin SDK environment plus the target project ID.

```bash
set FIREBASE_PROJECT_ID=your-staging-project
npm run migrate:v3
npm run migrate:v3 -- --apply
npm run migrate:v3:verify
```

Rollback requires the exact manifest created by the apply operation:

```bash
npm run migrate:v3:rollback -- --backup="migration-backups/<backup>.json" --project="your-project-id"
```

Do not run apply in production before a managed Firestore export and verified staging rehearsal. See [Deployment and rollback](docs/mindguide-secure-release/DEPLOYMENT.md).

## Release status

The implementation and local release gates are complete on `codex/mindguide-secure-release`. Production remains closed until a Firebase project owner completes billing/API enablement, dedicated service-account IAM, App Check registration, Secret Manager configuration, credential rotation, staging migration/smoke testing, privacy-date configuration, and the controlled deployment checklist.
