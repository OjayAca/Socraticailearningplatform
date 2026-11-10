# Custom problem input

Local implementation, 2026-10-17. This is a bounded deterministic validator connected to the existing secure Socratic service, not a universal solver. No deployment, production data changes or live AI activation were performed.

## Topic scope

| Stable catalog ID | Supported family | Accepted display-name aliases |
| --- | --- | --- |
| quantitative-methods-functions | Function evaluation | Functions |
| discrete-mathematics-relations-and-functions | Function evaluation only | Relations and Functions |
| quantitative-methods-descriptive-statistics | Statistics | Descriptive Statistics; Measures of Central Tendency (legacy) |
| quantitative-methods-introduction-to-probability | Classical probability | Introduction to Probability |
| discrete-mathematics-discrete-probability | Classical probability only | Discrete Probability |
| discrete-mathematics-combinatorics | Counting | Combinatorics; Counting Principles (legacy) |
| discrete-mathematics-set-theory | Numerical sets | Set Theory |
| discrete-mathematics-logic | Boolean evaluation | Logic |

Aliases support engine compatibility only. The API requires a real stable catalog ID with its correct approved subject/topic record; aliases never bypass approval. Other catalog topics remain unsupported for custom input. Shared UI guidance and family mapping live in `src/lib/learning/custom-problem-config.ts`.

## Examples and reference formats

| Input | Reference |
| --- | --- |
| Given f(x) = 2x + 3, find f(5). | 13 |
| Given f(x) = x^2 + 2x + 1, find f(3). | 16 |
| Find f(4) if f(x) = 3x - 2. | 10 |
| Find the mean of the scores 4, 8, and 12. | 8 |
| median: -2, 4, 9 | 4 |
| mode: 2, 2, 5 | {2} |
| Find the range of 2, 9, and 5. | 7 |
| sample variance: 2, 4, 6 | 4 |
| population variance: 2, 4, 6 | 2.6666666666666665 |
| sample standard deviation: 2, 4, 6 | 2 |
| population standard deviation: 2, 4, 6 | 1.632993161855452 |
| product: 3, 4 | 12 |
| permutation: 5, 2 | 20 |
| How many combinations are possible when choosing 3 from 8? | 56 |
| probability: 2, 8 | 0.25 |
| Find the probability of 3 favorable outcomes out of 10 equally likely outcomes. | 0.3 |
| Find the union of {1, 2, 3} and {2, 3, 4}. | {1, 2, 3, 4} |
| Find the intersection of {1, 2, 3} and {2, 3, 4}. | {2, 3} |
| Find the difference of {1, 2, 3} and {2, 3, 4}. | {1} |
| Evaluate p AND q when p=true and q=false. | false |

Statistics/counting accept `Find`, `Calculate`, `Compute`, or `What is`, optionally `the`, followed by the operation and `of`/`for`, or the compact colon form. Datasets use commas and optional final `and`; prose beyond this grammar is rejected. A trailing period/question mark is accepted. Sets are sorted and deduplicated; difference is left minus right. No mode is `{}`, tied modes contain every most frequent value. Numeric references use finite JavaScript numbers; counting uses exact integer calculations and safe-integer output. Other numeric answers use absolute tolerance 0.000001. Boolean references use the existing truth specification.

## Mathematical notation

Use the existing MathInput plain-text field and optional notation editor. Insert `[math]` exactly once in the sentence where notation belongs. Example: text `Given f(x) = [math], find f(3).`, notation `x^{2}+\\frac{2x}{3}` (use single backslashes in the editor). The fields are submitted unchanged together. There is no implicit preference for one field over the other.

Supported normalization: `\\left`, `\\right`, escaped braces, spacing commands, `\\cdot`, `\\times`, `\\div`, literal braced integer powers, simple non-nested `\\frac{a}{b}`, `\\cup`, `\\cap`, `\\setminus`, `\\land`/`\\wedge`, `\\lor`/`\\vee`, `\\neg`/`\\lnot`, and corresponding Unicode set/logical symbols. Unknown commands fail the mathematical grammar. KaTeX rendering is only a preview, never mathematical validation. MathInput still supports its existing learner-response behavior; only the custom-problem text limit is configured to 2000.

## Bounds and exclusions

- Text: existing API minimum 8, maximum 2000 characters. Notation: maximum 2000 characters. The placeholder must be expanded into a supported complete problem.
- Dataset/set: at most 50 numbers per operand, absolute value at most 1,000,000. Empty sets are allowed; empty datasets are not. Sample dispersion requires at least two values. Specify population or sample explicitly.
- Function: variable x only, numeric input/constants within +/-1,000,000; expression length 240 and at most 100 tokens including inserted multiplication. Parentheses, unary signs, +, -, *, /, and literal integer exponents 0–10. Implicit multiplication before x or `(` is supported. Powers follow conventional unary-minus precedence. Chained powers, negative exponents, scientific notation, other variables/functions, and division by zero are rejected.
- Non-counting numerical results/intermediates: absolute value at most 1e12. Floating-point calculations are deterministic, not arbitrary-precision symbolic algebra.
- Counting: integer counts 0–100; permutation/combination exactly n,r with r <= n; result at most Number.MAX_SAFE_INTEGER. Product intermediate results are also bounded.
- Probability: two integer counts 0–1,000,000, total positive, favorable <= total; equal likelihood is assumed by the compact form.
- Logic: single-letter variables, explicit unique true/false assignments; expression 240 characters/100 tokens; precedence parentheses, NOT, AND, OR. Unknown variables/operators fail.
- No calculus, domain/range, composition, arbitrary word problems, conditional probability, distributions, symbolic sets, proofs, quantifiers, OCR, or images. UI toolbar availability does not imply validator support.

## Security and session flow

Preview and start share request schemas. After membership/consent checks, preview checks approved catalog topic and subject. Start additionally preserves pilot admission, enabled-topic and disabled-backend checks. The deterministic engine normalizes notation, parses the entire input, checks family compatibility and parameters, and computes a reference privately. Expected parser failures become HTTP 422 `invalid-problem`; malformed API contracts remain HTTP 400; unrelated infrastructure failures are not converted into mathematical errors.

The service SHA-256 digest binds original text, notation, topic, difficulty and parsed givens. The engine's internal serialized confirmation material is not the API hash. Every start recomputes it and the reference, including when an existing active assignment is present. Changing either field or difficulty requires a new preview. This is an input consistency fingerprint, not an authorization token: all permissions and calculations are independently repeated. Browser-provided answer/reference fields are stripped by the schema and never used.

The original forms are stored as originalProblemText/originalProblemLatex; originalQuestion contains the expanded sentence so the current session UI and tutor receive the complete problem. Reference answers remain in the existing private reference document. No new chatbot, alternate scoring path or browser reference authority is introduced. Existing request IDs, leases, ownership checks, progressive support, reasoning gates, histories and scorecards remain in force. A synchronous UI submission lock prevents duplicate clicks, and the same captured fields are used for preview and start.

The deterministic validator establishes only bounded mathematical validity. AI pedagogy, diagnosis, reasoning assessment and final gated solution release still use the existing tutor. Prompt rules continue to treat questions as untrusted data. Tests with a fake tutor do not establish real-model behavior or deployed readiness.

## Local verification

No new environment variables are required. Keep the existing .env Firebase project and AI_ENABLED setting unchanged. Unit/component tests use isolated in-memory fixtures and require no live AI or database writes. No demo/emulator setup is needed. A real interactive AI session remains unavailable until separately authorized rollout readiness and genuine approvals are satisfied.

Feature coverage is in tests/unit/verified-problems.test.ts, tests/unit/ai-learning.test.ts and tests/component/task-start-p1.test.tsx. Existing secure-session, math-input, authentication, prepared-problem, ownership, reasoning-gate and reveal tests are retained. Run npm run typecheck, npm run lint, npm run test -- --maxWorkers=2, npm run build, and npm run scan:bundle. See the task report for actual command outcomes; live end-to-end validation remains pending.

### Verification results after follow-up acceptance review (2026-10-17)

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run test -- --maxWorkers=2`: 400 passed, 0 failed, 0 skipped across 41 files. No tests were disabled or removed.
- Focused native-route acceptance and service run: 70 passed, 0 failed, 0 skipped.
- `npm run build`: succeeded. The metadataBase warning remains (see below).
- `npm run scan:bundle`: passed, 47 assets checked against 12 forbidden markers and 357 private strings.
- `npm run test:e2e -- tests/e2e/public.spec.ts tests/e2e/hydration.spec.ts --workers=2`: 9 passed, 0 failed, 0 skipped against the local production server. These cover public navigation, desktop/mobile route protection, theme behavior and hydration, not authenticated custom sessions.
- No live authentication, production Firebase rules, Gemini, deployment, or AI activation check was performed. AI-enabled settings and approval records used by tests are isolated in-memory fixtures, never application configuration or Firebase data.

The originally suggested `src/lib/learning/client.ts` does not exist in this checkout. The active browser call chain is `src/lib/secure-api.ts` through `src/lib/ai-client.ts` to `app/api/learning/route.ts` and `server/services/LearningService.ts`.

### Previous failures and targeted fixes

The history test still mocked `getDocs`, but `useLearnerSessions` subscribes with `onSnapshot` through the shared authenticated view cache. Its mock now emits snapshots and returns an unsubscribe function. Assertions verify initial destinations, real-time transition from learning to submitted review, removal of old records, subscription reuse across route remounts, and disposal through `clearViews` (the auth-change cleanup path). The production real-time behavior was preserved.

The notification test required navigation to await a read-state write. `NotificationContent` deliberately navigates immediately; the store's existing optimistic-update tests verify immediate state, deduplication and rollback on failure. The component test now holds that write pending and verifies the destination is already visible, then resolves it. A second test rejects the pending write after navigation and verifies the error toast without undoing navigation. No delay or production notification change was introduced.

Review also found that a new valid custom problem could silently resume a different active assignment in the same topic. The learning service now compares problem mode, original text, notation and difficulty before reusing an active session. Different work returns 409 with instructions to finish or abandon the active session. Identical confirmed work still resumes, preserving the single-active-assignment and request recovery protections.

### Acceptance coverage and boundaries

`tests/component/custom-problem-integration.test.tsx` renders the actual task-start and MathInput components, calls the real secure API and AI HTTP client, and passes serialized requests through the real Next POST route and LearningService. Only external authentication, catalog/consent reads, Firestore storage and Gemini generation are replaced. The HTTP adapter is in-process; no external network call occurs. `tests/helpers/memory-learning-store.ts` shares the existing version-checked in-memory store with the service tests.

Its ten scenarios cover function evaluation, function notation, sample variance, combinations, wrong topic, unsupported derivative, malformed expression, changed confirmation, wrong learner computation with corrective guidance, and prepared assignment. Assertions check server-private reference values, no session writes on invalid input, transition to the existing session route, unreleased solutions, and progression/correction in the existing reasoning workflow. Existing service and session-component tests continue to cover ownership, admission, consent, request replay, quota, scorecard evidence, reveal prevention and history.

This is automated integration acceptance, not a claim that the complete authenticated browser-to-Firebase-to-Gemini workflow passed. The destination in the integration harness is a route marker, and subsequent reasoning is submitted through the real client; the full session UI has separate component coverage. Fake tutor outputs cannot establish real-model teaching quality or universal leak resistance.

### metadataBase investigation

`app/layout.tsx` uses the relative Open Graph image `/mindguide-logo.png`. The installed Next.js metadata guide explains that metadataBase supplies its absolute origin. The current application has no public site-origin setting in its environment or deployment configuration. The existing Firebase project/auth domain does not establish where the migrated Node backend will be hosted; README explicitly notes that static Firebase Hosting cannot run it.

No production domain was invented, and layout/deployment settings were left unchanged. The warning remains: the build defaults to localhost:3000 (local preview uses localhost:4173). Before public deployment/sharing, the operator must establish the actual HTTPS application origin and configure root metadataBase from that deployment setting. This affects social-preview URLs, not custom mathematical validation.

### Manual live acceptance still required

After separate authorization and genuine readiness verification, use the existing Firebase project and an active learner with pilot admission and acknowledgement of the current Gemini privacy notice. The selected real catalog subjects/topics must be approved and enabled for the pilot; prepared tests also require genuine reviewed problem/reference records. The backend needs valid server credentials, verified provider quotas, and separately authorized AI activation. None of those prerequisites were fabricated or changed here.

In a browser: enter function text and notation, statistics and counting examples; verify wrong-topic/unsupported/malformed feedback; start valid work; explain understanding and method; submit an incorrect computation and inspect corrective guidance; complete verification/interpretation and confirm that solution release and scoring occur only after required gates. Then verify saved history, ownership isolation, notification navigation and delayed-write failure behavior. Repeat prepared-problem practice and inspect history after completion. The existing live-auth Playwright tests require MINDGUIDE_E2E_STUDENT_EMAIL/PASSWORD (and admin counterparts for administrator checks); these do not by themselves cover full live custom-problem acceptance.
