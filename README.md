# MINDGUIDE

MINDGUIDE is a formative Socratic learning platform for Quantitative Methods and Discrete Mathematics. The application runs in **Next.js → native /api/learning → Firebase Admin / Firestore + Gemini**. Firebase browser authentication, the existing React Router interface, and workflow v6 are preserved.

Use the existing Firebase project configured in .env. Do not seed a demo database, connect an emulator, manufacture approvals, or run data migrations for this backend move.

## Local development

Use Node.js 22:

```sh
npm install
npm run dev
```

Open http://localhost:5173. Existing public VITE_FIREBASE_* values in .env remain supported through an explicit allowlist in next.config.mjs. New installations may use the equivalent NEXT_PUBLIC_FIREBASE_* identifiers. These must identify the same project as the server.

Set private backend values in ignored .env.local using the empty placeholders in .env.example: GEMINI_API_KEY, GEMINI_MODEL, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY. The private key accepts quoted escaped newlines. Preserve existing AI_ENABLED, AI_FREE_TIER_CONFIRMED, GEMINI_RPM, GEMINI_TPM, GEMINI_RPD, and optional OPERATOR_UID settings. Missing enablement defaults to disabled. Never prefix secrets with NEXT_PUBLIC_ or VITE_.

## Verification

```sh
npm run check
npm run test:e2e -- tests/e2e/public.spec.ts
npm run ai:preflight
npm run ai:health
```

ai:preflight reads the real learning configuration using the signed-in Firebase operator. ai:health authenticates the existing operator account and checks the running backend, defaulting to localhost:5173; use MINDGUIDE_BASE_URL for another deployment. It does not create learning records. Add -- --probe to health to test structured Gemini output. npm run ai:probe -- --free-tier-confirmed tests Gemini directly without student data or database writes. Probes consume provider quota.

Unit/component tests use in-memory fixtures only. Public browser tests cover navigation, login-page rendering, and signed-out route protection. Authenticated learning verification requires an existing admitted account, current consent, and genuinely approved content.

## Source layout

```text
app/
  layout.tsx                    Existing page metadata, fonts and styles
  client-app.tsx                Browser-only host for the existing interface
  [[...slug]]/page.tsx          Existing client route entrypoint
  api/learning/route.ts        Authenticated Node.js API
server/
  auth.ts                      Firebase ID-token verification
  config.ts                    Private configuration and project guards
  firebase.ts                  Reused Firebase Admin app
  firestore.ts                 Atomic, version-checked Firestore adapter
  gemini.ts                    Existing prompts, Tutor and Zod output schemas
  platform.ts                  Service contracts and errors
  services/LearningService.ts  Existing learning workflow
src/                          Existing interface and browser Firebase services
packages/contracts/           Shared types and workflow ordering
```

All nine learning mutations, activity checks and verified-problem previews remain available. Backend membership, consent, content approval, ownership, quota, idempotency and progress checks remain authoritative. Historical records retain their original workflow/scoring versions.

## Deployment

Build and run on a Node.js Next.js host:

```sh
npm ci
npm run check
npm start
```

Configure the same public Firebase identifiers before building and private backend secrets through the host's secret store. Run one Next.js service for both interface and API. npm start listens on port 3000 by default; pass -- --port PORT if required. Allow at least 120 seconds for API requests at the hosting/proxy layer. Existing learner request deadlines and lease protections remain in place.

Use a region supported by the configured Gemini project. Add the application hostname to Firebase Authentication's authorized domains and any enabled App Check configuration. Keep existing Firebase rules and indexes. firebase.json now contains only Firestore deployment targets; plain Firebase Hosting static deployment cannot run this backend. Do not deploy the obsolete dist directory or use static export.

Publish the repository's current Firestore rules to the existing project as part of the backend migration. Older rules deny the browser's tutor-message reads even when the server can save a session:

```sh
npm run test:rules
npx firebase deploy --only firestore:rules --project socratic-ai-a7765
npm run test:rules -- --deployed
```

The rules tests use Firebase's hosted rules simulator and do not create database records. They check that active learners can read their own conversations while other learners, signed-out users, and suspended users cannot.

See [migration details and acceptance checks](docs/NEXT_BACKEND_MIGRATION.md). Older deployment/audit documents are historical evidence and must not be used to redeploy the retired architecture.
