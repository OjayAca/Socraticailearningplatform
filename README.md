# MINDGUIDE

MINDGUIDE is a secure, formative reasoning platform for Quantitative Methods and Discrete Mathematics capstone acceptability evaluation. Its six core learning capabilities are the step-by-step Socratic solver, formula/theorem justification, misconception diagnosis, adaptive difficulty, progressive solution unlocking, and a four-criterion critical-thinking scorecard. It is not an official grading system and does not claim permanent improvement in critical thinking.

## Secure architecture

- React renders learner-safe projections and sends bounded input to callable APIs.
- Firebase Functions Gen 2 owns problem validation, progression, diagnosis, support, scoring, adaptation, statistics, notifications, administrative mutations, retention, and anonymization.
- Firebase Auth custom claims are the role authority (`student` or `admin`). App Check is enforced outside the emulator.
- Firestore separates public learning records from private references, evaluator configuration, raw AI interactions, rate limits, and audit evidence.
- Gemini runs only in Functions with `GEMINI_API_KEY` stored in Secret Manager. The production-bundle scan rejects client AI code and known private instructional material.
- MathLive provides keyboard input, KaTeX renders notation, and CortexJS Compute Engine performs server-side parsing and equivalence checks.

Learners see four stages: Problem Understanding, Method Selection, Computation, and Interpretation. Seven internal reasoning gates retain separate checks for relevant information, formula/theorem justification, and verification. Diagnosis runs after every response, the scorecard is generated before the worked solution is released, and existing dashboards, history, notifications, administration, review, and privacy features remain available as supporting capabilities.

## Workspaces

- `packages/contracts`: canonical schema-v4 types and workflow order.
- `functions`: trusted Gen 2 callables and scheduled retention.
- `src`: React learner and System Administrator interfaces.
- `scripts/migrate-v4.ts`: faculty-gated 99-problem schema-v4 dry-run/apply/verify/rollback migration.
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
npm run deadcode
npm run test
npm run test:rules
npm run build
npm run scan:bundle
npm run test:e2e
```

For interactive localhost development, `npm run dev` starts the callable Functions
emulator and Vite together. Auth and Firestore still use the Firebase project from
`.env`; only callable Functions are routed to `localhost:5001`. Use `npm run dev:web`
only when the callable Functions are already deployed and configured for the target
project.

Automated AI tests use deterministic logic and fixtures. Live Firebase sign-in tests run only when their documented environment credentials are supplied.

## Schema-v4 migration

Migration is dry-run by default and requires an authenticated Admin SDK environment plus the target project ID. It upgrades an existing schema-v3 project; it also seeds missing managed references defensively, but production must still follow the staged export/restore procedure.

```bash
set FIREBASE_PROJECT_ID=your-staging-project
npm run migrate:v4
npm run migrate:v4 -- --apply
npm run migrate:v4:verify
npm run release:preflight -- --project=your-staging-project --output=preflight.json
```

Rollback requires the exact manifest created by the apply operation:

```bash
npm run migrate:v4:rollback -- --backup=".local-backups/<backup>.json" --project="your-project-id"
```

Do not run apply in production before a managed Firestore export and verified staging rehearsal. See [Deployment and rollback](docs/mindguide-secure-release/DEPLOYMENT.md).

## Release status

Schema-v4 repository implementation is complete. The learner catalog remains intentionally closed until all 99 problem variants have recorded external faculty-validation evidence. Production also remains closed until a Firebase project owner completes billing/API enablement, dedicated service-account IAM, App Check registration, Secret Manager configuration, credential rotation, staging migration/smoke testing, privacy-date configuration, and the controlled deployment checklist.
