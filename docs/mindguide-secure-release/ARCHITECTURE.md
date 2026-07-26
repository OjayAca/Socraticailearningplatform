# Architecture and Trust Boundaries

## Request flow

1. Firebase Authentication establishes identity; the `role` custom claim establishes authority.
2. Firebase App Check attests the production web client.
3. React submits a typed callable request. Every mutation carries a UUID request ID.
4. Before a first session, a Gen 2 Function validates and stores the learner's required academic profile.
5. The catalog callable exposes topics only after all 99 problem variants have immutable faculty-validation evidence.
6. Session start resolves the approved topic, adaptive policy, least-recently-used variant, formula/theorem references, seven prompts, and misconception policies.
7. Resolved content is version-pinned in the session; deterministic scope/math/rule checks take precedence and structured AI is used only for supported ambiguous gates.
8. A Firestore transaction commits the public projection, private evidence, statistics, notifications, audit event, and idempotent result.
9. The browser receives only learner-safe feedback and the next server-authorized state.

Server SDK operations bypass Firestore rules. Deploy Functions with the dedicated account configured by `FUNCTIONS_SERVICE_ACCOUNT`; do not use a broad project-owner runtime identity.

## Authoritative components

- `sessions.ts`: profile bootstrap, adaptive prepared-problem selection, seven internal gate evaluations grouped into four visible stages, support, drafts, score-before-solution release, exactly-once submission, abandonment, and linked follow-ups.
- `configuration.ts`: catalog readiness, approved-content resolution, configuration version snapshots, and topic-scoped difficulty policy precedence.
- `workflow.ts`: deterministic evaluation, diagnosis taxonomy, adaptive prompt scaffolding, support thresholds, four 25-point criteria, and two-session topic adaptation.
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

The current gate starts with a domain-specific Socratic prompt. One failed response enables a targeted hint; two corrective cycles enable a stronger hint; three enable one partial step. Worked explanations and final answers remain locked after the seven internal gates until the learner's final response has been scored. Administrator support exceptions are post-score and cannot bypass this sequence.

The scorecard contains four 25-point criteria: accuracy, logical validity, method selection, and explanation quality. Explanation quality combines formula/theorem justification with contextual interpretation. Each result includes score, evidence, reason, improvement advice, confidence, and source. Non-empty fields or text length never produce a score by themselves.

Gemini does not generate the final scorecard. It is used only to evaluate otherwise plausible but semantically ambiguous reasoning-gate responses. The final scorecard remains deterministic from accepted gates, correction cycles, saved work, and mathematical answer checking.

## Configuration and adaptation boundaries

- Approved administrator changes affect new sessions only; in-progress and historical sessions retain their private configuration snapshot.
- Managed records provide instructional statements, conditions, prompts, corrective templates, and numeric thresholds. They cannot execute code or bypass deterministic safety checks.
- Curated sessions adapt both difficulty and the assigned non-repeating variant. Free-form problems retain their intrinsic requested difficulty and adapt only Socratic scaffolding because the server cannot substitute a learner-authored question.

## Failure contract

Callable failures expose a stable code, safe message, retryable flag, and correlation ID. Stack traces, raw model output, prompts, answer material, internal rubrics, and keys stay inside the trusted boundary.
