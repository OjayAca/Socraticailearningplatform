# MINDGUIDE

MINDGUIDE is a formative learning application for Quantitative Methods and Discrete Mathematics. Workflow v6 uses **React → Cloudflare Worker → Gemini Free + Firebase Spark**, with Firebase Authentication and Hosting. Learning decisions move to the Worker; old practice records remain readable without rescoring.

**AI rollout is not yet complete.** The Worker is deployed with student AI disabled. Follow [AI setup and rollout](docs/AI_TUTOR_SETUP.md) and [verification status](docs/AI_IMPLEMENTATION_STATUS.md). The Spark-only details below describe the historical workflow and are not v6 deployment instructions.

The existing Firebase project in `.env` is the application database. Do not replace it with a demo project, connect an emulator, seed sample questions, or manufacture validation records.

## Learning behavior

- Topic selection reads only approved topics from `topics`.
- Prepared questions come from the existing `problems` collection. Only approved, validated questions with matching published scoring references are assignable.
- Previously answered questions remain excluded, including historical responses. Transactions coordinate assignment and resumable sessions across tabs.
- The seven guided phases, mathematical input, hints, supported own-problem formats, drafts, scoring, submissions, achievements, dashboard, and history remain available.
- Difficulty starts at Basic. First-answer accuracy over up to five completed questions in the selected topic increases difficulty at 80% or above, maintains it at 50–79%, and decreases it below 50%.
- New scorecards use `spark-practice-v1`: four local criteria worth 25 points each. These are client-generated practice indicators, not official or tamper-proof assessments. Historical scores are not rescored.
- Learner data is owner-scoped. Administrators retain content management, validation, review, reporting, announcements, and application account-status controls.

## Development and verification

Use Node.js 22 and the existing `.env` configuration. `.env.example` describes public web configuration; it is not a replacement database.

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run scan:bundle
npm run test:e2e
```

`npm run test:rules` uses Firebase's hosted rules simulator and the signed-in operator. It supplies simulated request/function contexts and does not create Firestore test data or start an emulator. The unit tests use in-memory mocks only.

## Spark deployment

```sh
firebase login
npm run migrate:spark
npm run migrate:spark -- --apply
npm run release:preflight
npm run test:rules
firebase deploy --only firestore:rules,firestore:indexes,hosting --project socratic-ai-a7765
```

The migration is dry-run by default, verifies the project against `.env`, and publishes only allowed scoring fields from genuinely approved content. It never approves questions, populates a demo bank, or changes historical learning records. If there are no approved questions, it correctly performs no conversion.

See [Spark operations and deployment](docs/SPARK_DEPLOYMENT.md) for readiness checks, manual account administration, retention, and rollback. Earlier files under `docs/mindguide-secure-release` describe the retired server architecture and are historical evidence, not current deployment instructions.

## Source layout

- `src/lib/learning`: browser-compatible mathematical checks, guided workflow, scoring, progress, and adaptive selection.
- `src/lib/learning-service.ts`: owner-scoped Firestore learning transactions.
- `src/lib/admin-service.ts`: Firestore administration; privileged Auth operations are directed to Firebase Console.
- `packages/contracts`: shared types and workflow ordering.
- `scripts/migrate-spark.ts`: operator-only conversion of existing validated scoring material.

Firebase's `firebase` umbrella package may include transitive Functions SDK packages in its installation. The application does not import or initialize them, and there is no Functions backend workspace or deployment target. Admin SDK usage is restricted to local operator scripts.
