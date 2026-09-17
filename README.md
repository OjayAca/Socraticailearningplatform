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

- `packages/contracts`: canonical schema-v5 types and workflow order.
- `functions`: trusted Gen 2 callables and scheduled retention.
- `src`: React learner and System Administrator interfaces.
- `scripts/migrate-v4.ts`: legacy schema-v4 migration; `scripts/migrate-v5.ts` prepares the two-topic pilot.
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

Authenticated supporting-feature checks run only against a dedicated staging
deployment. Supply `MINDGUIDE_E2E_BASE_URL` plus separate student and administrator
credential variables shown in `.env.example`, then run:

```bash
npm run test:e2e:staging
```

The staging preflight rejects missing credentials, duplicate role accounts, invalid
URLs, and the known `socratic-ai-a7765` host. It does not deploy or seed data. The
live suite restores its reversible account-status change; permanent deletion,
retention, and anonymization stay in isolated automated tests. Google OAuth and
password-reset inbox delivery remain documented manual staging checks.

For interactive localhost development, `npm run dev` starts Vite and connects
directly to the Firebase project configured in `.env`, including its deployed
Auth, Firestore, and Functions services. No demo database is created or restored.
Do not replace the configured project with a demo project or seed sample data.

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

## Controlled pilot and release status

The v5 repair adds typed private answers, verified own-problem formats, response-linked formative scoring, safe hints, topic manifests, cohort admission, maintenance enforcement, recovery, and complete report pagination. The initial review bank has 18 distinct draft problems across Measures of Central Tendency and Counting Principles. Drafts are not faculty approvals.

Use `npm run migrate:v5 -- --project=<staging-id>` for a dry run, then `--apply` only in closed staging. Legacy data must complete the v3 security conversion before v4/v5. Historical scores are not silently rescored; incompatible unfinished sessions become read-only.

The application is **not approved for participant release**. Faculty content/rubric approval, research protocol and privacy decisions, authenticated staging, cloud configuration, measured load/cost, and managed backup restoration remain required. See [v5 repair evidence](docs/mindguide-secure-release/PILOT_V5_REPAIR.md) and [deployment procedure](docs/mindguide-secure-release/DEPLOYMENT.md).
