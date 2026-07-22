# Architecture and Trust Boundaries

## Request flow

1. Firebase Authentication establishes identity; the `role` custom claim establishes authority.
2. Firebase App Check attests the production web client.
3. React submits a typed callable request. Every mutation carries a UUID request ID.
4. A Gen 2 Function validates account state, input, rate limits, idempotency, session ownership, revision, and current phase.
5. Deterministic scope/math/rule checks take precedence. Structured AI is used only for supported ambiguous cases.
6. A Firestore transaction commits the public projection, private evidence, statistics, notifications, audit event, and idempotent result.
7. The browser receives only learner-safe feedback and the next server-authorized state.

Server SDK operations bypass Firestore rules. Deploy Functions with the dedicated account configured by `FUNCTIONS_SERVICE_ACCOUNT`; do not use a broad project-owner runtime identity.

## Authoritative components

- `sessions.ts`: profile bootstrap, start, seven gate evaluations, support, drafts, scorecards, exactly-once submission, abandonment, and linked follow-ups.
- `workflow.ts`: deterministic evaluation, diagnosis taxonomy, support thresholds, five 20-point criteria, and two-session topic adaptation.
- `ai.ts`: server-only Gemini validation and structured ambiguous evaluation.
- `math.ts`: LaTeX bounds, unsupported-command rejection, canonicalization, evaluation, and symbolic equivalence.
- `admin.ts`: immutable review decisions, last-admin-safe user operations, versioned content, support exceptions, reports, CSV exports, and audits.
- `privacy.ts`: daily expiry, 90-day raw-AI deletion, post-study anonymization, and audit retention.
- `security.ts`: authentication, claim checks, idempotency, rate limits, and one evaluation lease per session.

## Confidence policy

- Deterministic pass: gate may advance.
- High-confidence structured AI: gate may advance.
- Medium confidence: learner must clarify.
- Low confidence, malformed model output, timeout, or AI failure: gate remains blocked and an AI-failure record is written.
- Blank, malformed, irrelevant, unsupported, incorrect, future-phase, and stale-revision requests cannot advance.

## Support and scoring

The current gate starts with a Socratic prompt. One failed response enables a targeted hint; two corrective cycles enable a stronger hint; three enable one partial step. Worked explanations and full solutions require all seven gates or an audited administrator exception with a reason.

The scorecard contains accuracy, logical validity, method selection, justification quality, and interpretation quality. Each result includes score, evidence, reason, improvement advice, confidence, and source. Non-empty fields or text length never produce a score by themselves.

## Failure contract

Callable failures expose a stable code, safe message, retryable flag, and correlation ID. Stack traces, raw model output, prompts, answer material, internal rubrics, and keys stay inside the trusted boundary.
