> Historical documentation. The current application uses the native Next.js backend. See [current migration and deployment instructions](NEXT_BACKEND_MIGRATION.md) and [README](../README.md). Do not use the retired deployment commands below.

# AI tutor setup and rollout

Firebase project: `socratic-ai-a7765`. Worker: `mindguide-socratic-tutor`.
Endpoint: `https://mindguide-socratic-tutor.mindguide.workers.dev/api/learning`.
Student AI remains disabled (`AI_ENABLED=false`). No billing upgrade or replacement database has been enabled.

## Secrets and quota

1. Sign in to the existing accounts using `firebase login` and `npx wrangler login`.
2. Keep `GEMINI_API_KEY` server-only in ignored `.env`; never prefix it with `VITE_`.
3. `node --import tsx scripts/provision-ai-worker.ts` previews the restricted service-account setup. `--apply` provisions it and pipes credentials into Worker secrets. This has already been completed. Do not create replacement keys unnecessarily.
4. Worker secrets are `GEMINI_API_KEY` and `FIREBASE_SERVICE_ACCOUNT` (JSON). Rotate with `npx wrangler secret put NAME --config worker/wrangler.jsonc`, entering the value at the private prompt. Keep the ignored recovery file `.local-backups/ai-worker-service-account.json` private.
5. Confirm the key's project remains on Google AI Studio Free. Observed `gemini-3.6-flash` quota: 5 requests/minute, 250,000 tokens/minute and 20 requests/day. Configured headroom: 4 RPM, 200,000 TPM and 18 RPD. Seven gates plus opening and separate scoring require at least nine calls/session; twenty daily calls cannot support five students completing many sessions every day.
6. Set public `VITE_AI_WORKER_URL` to the Worker URL, without `/api/learning`; check `ALLOWED_ORIGINS` before building. Never automatically substitute a paid model.

Each turn reserves 32,000 tokens conservatively. Uncertain calls are not refunded. Daily counters use Pacific dates. Other uses of the same key consume provider quota outside the app's counters.

## Live checks and Free feasibility

```sh
npm run worker:typecheck
npm run worker:bundle
npm run worker:deploy
node --import tsx scripts/ai-worker-health.ts
node --import tsx scripts/ai-worker-health.ts --probe
```

Health authenticates only the signed-in Firebase operator's existing application account, creates no learner/content records and never prints tokens. `--probe` consumes one Gemini call. It checks auth, Firestore, structured output and bounded arithmetic; it does not demonstrate a whole session. Do not loop probes.

The Worker uses Smart Placement (`placement: { "mode": "smart" }`) to optimize routing across all three Google endpoints (Gemini, Firestore, OAuth). If Gemini location restrictions recur, fall back to `"region": "aws:us-east-1"`. A single automatic retry with a 2-second wall-clock delay is executed on 503 Service Unavailable (wall-clock wait incurs zero CPU cost); note that a retry consumes an extra call against the 18 RPD quota.

Measure **request CPU** in Cloudflare Metrics for the current deployment, including cold/warm requests, scoring and full session operations. Wrangler startup time is a different metric. Free Workers allow 10 ms CPU/request and 50 subrequests; remote waiting is excluded. To meet the 10 ms budget, the Worker caches the parsed service account and imported RSA `CryptoKey`, pre-stringifies JSON schemas, uses character-length heuristic sizing guards, and retains operation validation schemas at module scope. Do not open the pilot until full operations fit under 10 ms. No billing upgrade is authorized. See [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).

## Real content and consent

Run `npm run ai:preflight`. Add only genuine instructor-reviewed materials through existing content management/validation, with matching private references and approval evidence. Cover Pigeonhole Principle, mean, variance and regression; report missing difficulty levels explicitly. Do not seed questions, create synthetic approvals, switch databases or start an emulator.

Preview the notice with `node --import tsx scripts/prepare-ai-notice.ts`. During coordinated rollout, `--apply` publishes a new version based on the existing notice and preserves retention details. Each learner must acknowledge it themselves. The script never fabricates consent. Do not merely flag the old notice AI-ready without changing its content/version.

Configure the actual pilot participants and enabled topics using administrator controls. Start with one student because daily quota is small. Leave the pilot paused until readiness is verified.

## Coordinated release

```sh
npm run check
npm run worker:bundle
npm run test:rules
npx playwright test tests/e2e/public.spec.ts --workers=1
npm run release:preflight
```

Resolve failures first. Deploy the Worker with AI disabled, publish the new notice, then deploy the web app/rules/indexes together:

```sh
firebase deploy --only firestore:rules,firestore:indexes,hosting --project socratic-ai-a7765
```

Never deploy just the new rules while the old browser learning workflow is active. Hosting's gate checks real content/privacy and verifies the target against `.env`. Historical sessions remain readable; students start new AI sessions rather than silently upgrading old evaluations.

After successful live validation, set `AI_ENABLED=true`, redeploy and open the pilot. Exercise all four topics, alternative methods/proofs, misconception correction, bypass attempts, assistance, refresh, stale tabs, quotas and protected references. Monitor failures, latency, request CPU and quotas without logging credentials or student text.

## Pause and recovery

Set pilot state to `paused` to block new sessions while admitted students finish existing sessions. For an immediate AI stop, set `AI_ENABLED=false` and redeploy. Pilot `write-freeze` stops learning mutations. Owner reads and historical records remain available.

Errors preserve gates and saved messages. Retry the same request after interruption; reload stale sessions. Leases expire after 90 seconds. There is no automatic retry loop or local feedback presented as AI.

This guide replaces historical Spark-only deployment instructions. Do not restore permissive student score/reference writes as rollback.
