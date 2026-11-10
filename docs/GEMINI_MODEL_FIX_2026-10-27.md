# Gemini model-access repair — October 27, 2026

## Cause and change

A bounded generation probe with the configured key returned HTTP 404 NOT_FOUND: gemini-2.5-flash-lite is no longer available to new users, with Google's response recommending gemini-3.5-flash-lite. The metadata GET/list endpoints still returned the old model, so listing alone did not validate generation access. This failure was not HTTP 429 quota exhaustion. The separate application daily limit remains 18.

Changed only GEMINI_MODEL in the ignored .env.local from gemini-2.5-flash-lite to gemini-3.5-flash-lite. Existing key, Firebase project, quota limits, billing and student data were retained. Google's current pricing documents free-tier text input/output for the replacement: https://ai.google.dev/gemini-api/docs/pricing . No remote deployment occurred.

In server/gemini.ts, provider 404 now produces ai-model-unavailable with an actionable, fixed message instead of the generic temporary-unavailability message. Raw provider details are not exposed. Added two cases in tests/unit/ai-learning.test.ts distinguishing 404 model access from 429 quota, asserting one request and no private provider message disclosure. No automatic model fallback or quota bypass was introduced.

## Executed validation

- Minimal replacement generation probe: HTTP 200, STOP, same key. Old-model failure and new-model result saved in security-evidence-2026-10-26/probe-*.json. These are operator health probes, not question acceptance tests or database content.
- npm run ai:probe -- --free-tier-confirmed: structuredResponseValid true using the actual tutor schema.
- npx vitest run tests/unit/ai-learning.test.ts --maxWorkers=2: 73/73 PASS.
- npx eslint server/gemini.ts tests/unit/ai-learning.test.ts: PASS.
- npm run build: PASS including TypeScript; existing React 18 deprecation and metadataBase warnings remain.
- npm run scan:bundle: PASS, 47 assets / 12 markers / 357 private strings.
- npm run ai:health: HTTP 200, authenticated, Firestore connected, replacement model confirmed. No generation probe in this health command.
- git diff --check: PASS.

## Live recovery

Authorized student session DM-01-B01 resumed from 75%. Final interpretation accepted, all gates complete, solution button released, scorecard and worked answer generated successfully. Final answer matches the protected source: {-2,0,2,4}, including zero and upper endpoint 4. Four criteria scored 25 each, assistance 1 disclosed separately. Finish session saved a submitted record.

Read-only scripts/verify-question-bank-session.ts confirmed original question/reference equality, five assessed responses, seven accepted gates, exactly one matching 100-point scorecard, solution released, statistics committed, completed-session count 4 (previously 3). Evidence: security-evidence-2026-10-26/set-builder-model-fixed.json and set-builder-model-fixed.png. The question's earlier stages used the former model; this is not an all-stage revalidation of every question against the replacement model. Existing three deployed rules failures and broader release blockers are unchanged.

## Rollback / scope

Browser refresh after submission again displayed Session submitted. Screenshot: security-evidence-2026-10-26/set-builder-submitted-refresh.png.

Only the local server was rebuilt and restarted. Restoring the prior GEMINI_MODEL and restarting is mechanically reversible but would restore the verified provider 404 for this key. A supported model with a successful structured generation probe is required. No keys were created or rotated, no billing was enabled, no question records were imported/edited, and no production application or rules were deployed.
