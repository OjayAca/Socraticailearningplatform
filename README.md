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

Set private backend values in ignored .env.local using the empty placeholders in .env.example: GEMINI_API_KEY, GEMINI_MODEL, FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY. The private key accepts quoted escaped newlines. Preserve existing AI_ENABLED, AI_FREE_TIER_CONFIRMED, GEMINI_RPM, GEMINI_TPM, GEMINI_RPD, and optional OPERATOR_UID settings. Optional security controls in `.env.local` include AUTH_CHECK_REVOKED (set `"true"` when `FIREBASE_CLIENT_EMAIL` has Firebase Auth Viewer `firebaseauth.users.get` permission for live ID token revocation checks), APP_CHECK_ENFORCED (set `"true"` in production once reCAPTCHA Enterprise App Check is active), USER_GEMINI_RPM, USER_GEMINI_RPD, USER_EXTRACTION_RPM, and USER_EXTRACTION_RPD. Missing enablement defaults to disabled. Never prefix secrets with NEXT_PUBLIC_ or VITE_.

## Verification

```sh
npm run check
npm run test:e2e -- tests/e2e/public.spec.ts
npm run ai:preflight
npm run ai:health
```

ai:preflight reads the real learning configuration using the signed-in Firebase operator. ai:health authenticates the existing operator account and checks the running backend, defaulting to localhost:5173; use MINDGUIDE_BASE_URL for another deployment. It does not create learning records. Add -- --probe to health to test structured Gemini output. npm run ai:probe -- --free-tier-confirmed tests Gemini directly without student data or database writes. Probes consume provider quota.

Unit/component tests use in-memory fixtures only. Public browser tests cover navigation, login-page rendering, and signed-out route protection. Student accounts created with email and password must verify their email via the Firebase verification link (`/verify-email`) before accessing protected learning routes or `/api/learning`; Google OAuth accounts are verified by Google. Authenticated learning verification requires an existing admitted account, a verified email, current consent, and genuinely approved content.

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
  learning-policy.ts           Multi-dimensional adaptive difficulty & misconception tracking
  mathematical-diagnosis.ts    Deterministic arithmetic and bare-answer diagnostics
  platform.ts                  Service contracts and errors
  scorecard-rubric.ts          Evidence-based, assistance-aware scorecard calibration
  tutor-dialogue.ts            Condition-based justification, equivalence & stage hints
  services/LearningService.ts  Existing learning workflow
src/                          Existing interface and browser Firebase services
packages/contracts/           Shared types and workflow ordering
```

All nine learning mutations, activity checks and verified-problem previews remain available. Backend membership, consent, content approval, ownership, quota, idempotency and progress checks remain authoritative. HTTP responses enforce defensive security headers (`Content-Security-Policy`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy: same-origin-allow-popups`, and production HSTS) configured in `next.config.mjs` and `server/http-security.ts`. Historical records retain their original workflow/scoring versions.

## Core Pedagogical Architecture (Workflow v6)

1. **Step-by-Step Socratic Solver**: Guides learners through four stages (`problem_understanding`, `method_selection`, `computation`, `interpretation`) with problem-specific acceptance criteria (`STAGE_ACCEPTANCE_CRITERIA`), alternative valid method recognition, and selective checkpoint regression that reopens only affected checkpoints while preserving prior accepted evidence.
2. **Formula and Theorem Justification Module**: Combines deterministic and semantic equivalence recognition (`evaluateConditionEquivalence`) with negation/contradiction guards and subject-specific validation for Quantitative Methods and Discrete Mathematics (`validateJustificationBySubject`, `conditionPromptForMethod`).
3. **Error Diagnosis and Misconception Detector**: Classifies errors across 7 primary categories (`DIAGNOSIS_CATEGORY_LABELS`), cites non-fabricated learner evidence, recognizes independent self-correction (`selfCorrected` — allowing neutral Socratic prompts), and tracks persistent misconceptions across distinct sessions (`tentative` vs. `confirmed` vs. `resolved` in `learning_progress/{uid}.misconceptionProfile`).
4. **Adaptive Difficulty Engine**: Evaluates 6 learner dimensions (`accuracy`, `logicalValidity`, `methodSelection`, `explanationQuality`, active unresolved recurring misconceptions, and independence), assigns topic-level mastery (`Mastered`, `Developing`, `Needs remediation`) and stability-controlled decisions (`Advance`, `Maintain`, `Remediate`), and preserves `instructionalLevel` vs. `promptAdjustment`.
5. **Progressive Solution Unlock System**: Enforces sequential hint progression across Level 1–3 hints (`highestHintLevel: 0..3`) separated from complete solution release (`solutionUnlocked: boolean`), applies stage-specific disclosure guards (`leaksFutureCheckpoint` + `exposesAnswer`), provides controlled recovery (`recoveryMode`) after repeated checkpoint difficulty, and records `supportSummary`.
6. **Critical Thinking Scorecard**: Preserves the distinction between mathematical `accuracy` and reasoning quality (`logicalValidity`, `methodSelection`, `explanationQuality`), applies assistance adjustments only to the specific criteria that required stage support, and generates deterministic `nextPracticeRecommendation` guidance.

See [MINDGUIDE v6 Data Dictionary](docs/MINDGUIDE_V6_DATA_DICTIONARY.md) for the complete schema specification.

See [UI Notification Guidelines](docs/UI_NOTIFICATIONS.md) for when to use toasts, inline alerts, banners and confirmation dialogs.

## Deployment

Build and run on a Node.js Next.js host:

```sh
npm ci
npm run check
npm start
```

Configure the same public Firebase identifiers before building and private backend secrets through the host's secret store. Run one Next.js service for both interface and API. npm start listens on port 3000 by default; pass -- --port PORT if required. Allow at least 120 seconds for API requests at the hosting/proxy layer. Existing learner request deadlines and lease protections remain in place.

Use a region supported by the configured Gemini project. Production is served on Vercel at `https://mindguide-learn.me` (with `www.mindguide-learn.me` and `mindguide-learning.vercel.app` permanently redirecting to `https://mindguide-learn.me`). Add the application hostname (`mindguide-learn.me` and `www.mindguide-learn.me`) to Firebase Authentication's authorized domains and any enabled App Check configuration, and keep `hosting/mindguide-google.html` synced to Firebase Hosting on `socratic-ai-a7765` if trusted sign-in origins change. Keep existing Firebase rules and indexes. firebase.json now contains only Firestore deployment targets; plain Firebase Hosting static deployment cannot run this backend. Do not deploy the obsolete dist directory or use static export.

Publish the repository's current Firestore rules to the existing project as part of the backend migration. Older rules deny the browser's tutor-message reads even when the server can save a session:

```sh
npm run test:rules
npx firebase deploy --only firestore:rules --project socratic-ai-a7765
npm run test:rules -- --deployed
```

The rules tests use Firebase's hosted rules simulator and do not create database records. They check that active learners can read their own conversations while other learners, signed-out users, and suspended users cannot.

See [migration details and acceptance checks](docs/NEXT_BACKEND_MIGRATION.md). Older deployment/audit documents are historical evidence and must not be used to redeploy the retired architecture.
