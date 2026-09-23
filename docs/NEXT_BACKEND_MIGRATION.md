# Native Next.js backend migration

## Plan and architecture

Inspection found a Vite/React SPA with four Worker modules, rather than an existing Next.js application. Preserve the SPA and browser routes under a minimal Next.js host; migrate the service and Gemini modules without redesigning the workflow; replace manual JWT/Firestore REST handling with Firebase Admin; switch the client to a same-origin API; verify before removing Worker tooling.

The SPA hosting approach follows the [Next.js migration guide](https://nextjs.org/docs/pages/guides/migrating/from-vite). Token verification follows [Firebase Admin ID-token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).

## Changes

- Added `app` entrypoints and Node.js API, the `server` backend, Next.js configuration, PostCSS configuration, and backend auth/route/store tests.
- Relocated LearningService and Gemini prompts, output schemas, mathematical checks and tutor interfaces. Retained workflow/scoring versions, all nine mutations, activity checks, previews, and operator health diagnostics.
- Updated the AI client to POST `{operation,input}` to `/api/learning` with the current Firebase ID token. Response and error shapes are unchanged. Public Firebase environment access uses an explicit allowlist; no server configuration is forwarded to the browser.
- Replaced REST Firestore access with Admin SDK reads, equality queries, and transactions. Reads recursively normalize timestamps to Dates. Commits compare nanosecond update versions before atomically replacing all documents; missing versions require missing documents. Concurrent changes return 409 with no partial writes. AI calls remain outside transactions.
- Updated scripts, dependencies, test configuration, browser bundle scanning, and deployment guidance. Removed Worker source/configuration/deployment utilities and the Vite application entrypoint. Vite remains only as Vitest test infrastructure.
- Kept browser Firebase authentication, owner-scoped Firestore subscriptions, admin features, UI components and styles. The only component edit replaces environment-variable syntax in existing Firebase Console links.

## Configuration and security

Use `.env.example` for variable names and `.env.local` or a deployment secret store for values. Existing project settings, Gemini credentials and available existing service-account material were used for local setup; no credentials are committed. No database migration is needed. Real approvals, consent, pilot admission and content availability are still required.

Admin credentials and Gemini code use `server-only` imports. Firebase Admin validates ID-token signature, expiry, issuer and audience; the application additionally checks the project and UID format. Existing account-status checks remain in LearningService. No new Auth management permission is required for ordinary token verification. Tokens are accepted only through Authorization headers, not cookies. Cross-origin browser calls receive no CORS grants; the frontend uses same-origin requests.

The server rejects emulator environment variables, demo project IDs, mismatched web/server projects, malformed JSON and requests exceeding 20,000 bytes. Operational logs include only error status/code. Gemini responses retain Zod validation, confidence gates and solution-leak checks. The browser asset scan checks for server credentials, provider endpoints, private prompts and known answer material.

## Acceptance checks

1. Run `npm run check`: TypeScript, lint, unit/component tests, production build and public-asset scan.
2. Run public Playwright tests against the production Next.js server; verify direct URLs, login/signup views, route protection, desktop/mobile layout and theme behavior.
3. Run `npm run ai:preflight` to inspect current approved content/consent/pilot settings without changing them. Run health/probe commands from README for authenticated connectivity and structured output.
4. With an existing admitted learner, log in and start an approved question. Check the opening, learner response, feedback, all reasoning phases, support progression, draft, scorecard, submission, history, progress, achievements and notifications. Check abandon/follow-up and opening retry after provider failure. These interactions create genuine learning records and must not be replaced with synthetic admissions or approvals.
5. Refresh/resume a session and use two tabs: stale revisions should fail safely. Repeat a request ID: no duplicate tutor call, progress award or notification should occur. Confirm another user's session remains inaccessible.

## Deployment and rollback

Deploy to a host that runs a Next.js Node server or Node route functions, with private environment variables and the existing Firebase project. Do not deploy as a static-only site. Build-time public identifiers must match runtime server identifiers. Allow the API route's 120-second hosting budget, and preserve existing client timeout/lease recovery behavior. Verify Gemini region support using a probe before directing learners to the new host.

No production hosting or Cloudflare account changes are performed by this repository migration. Once the native deployment passes real-account checks, retire the previously deployed Worker using the Cloudflare dashboard. The source has no Worker deployment dependency. For rollback, restore the previous application release and its endpoint configuration; no Firestore rollback or reseeding is required. Do not revoke a shared service-account key while it is still used by the new backend.

## Verification results — September 23, 2026

- TypeScript, ESLint, production Next.js build and browser bundle scan passed. The scan checked 45 public assets against 12 forbidden markers and 357 private reference strings.
- The full existing and new backend suite passed (248 tests). Three additional client/workflow tests then passed with the targeted learning/client suite (36 tests), bringing the verified test total to 251.
- All eight public Playwright tests passed against the production Next.js server, including desktop/mobile routes and theme behavior.
- The live native API returned HTTP 200 for the existing operator: Firebase authentication verified, Firestore connected, privacy configured, AI enabled, structured Gemini output valid, mathematical check correct. No learning records were created by this health check.
- The read-only content preflight found zero approved/ready prepared questions in the existing project. A real curated-session walkthrough therefore remains unverified. No content, approvals, admission or consent records were fabricated or changed. Phase progression, drafts, scoring, submissions, achievements and notifications were verified with isolated in-memory tests.
- The existing provider returned a temporary 503 during the direct probe; the preserved retry succeeded. The later probe through the native API succeeded.
