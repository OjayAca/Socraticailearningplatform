# Schema-v3 Data Dictionary

## Public or learner-readable

| Path | Purpose | Client writes |
|---|---|---|
| `users/{uid}` | Display profile, mirrored role/status, preferences | Own bounded preferences/display name only; creation is callable |
| `users/{uid}/consents/{version}` | Versioned consent acknowledgement | None |
| `subjects`, `topics` | Approved curriculum metadata | None |
| `problems/{id}` | Approved problem metadata and prompt text | None |
| `policy_documents/{version}` | Active privacy/responsible-AI notice | None |
| `sessions/{id}` | Owner-visible server state and immutable legacy history | None |
| `sessions/{id}/responses` | Learner response plus safe evaluation/diagnosis | None |
| `sessions/{id}/scorecards` | Evidence-backed formative criterion results | None |
| `sessions/{id}/unlock_events` | Authorized support already released | None |
| `learning_progress/{uid}` | Aggregate learner progress and recommendations | None |
| `notifications/{id}` | Recipient notification | Recipient may only change `read` to true |

## Protected

| Path | Contents | Access |
|---|---|---|
| `problems/{id}/private/solution` | Validated concepts, formulas/theorems, steps, final result, interpretation, prompt map | Admin/server |
| `sessions/{id}/private/reference` | Immutable session-specific validation reference | Admin/server |
| `sessions/{id}/private_evaluations` | Internal evaluator evidence where required | Admin/server |
| `sessions/{id}/private_ai` | Raw model interaction with 90-day expiry | Admin/server |
| `socratic_prompt_bank` | Versioned managed prompt templates | Admin/server |
| `formula_theorem_references` | Conditions and validation references | Admin/server |
| `misconception_categories` | Diagnosis policy | Admin/server |
| `difficulty_policies` | Adaptation thresholds | Admin/server |
| `system_settings` | Privacy, retention, maintenance, and release settings | Admin/server |
| `audit_logs` | Immutable administrative/export/privacy evidence | Admin/server |
| `ai_failure_logs` | Correlated AI fallback/failure evidence | Admin/server |
| `idempotency`, `rate_limits`, `evaluation_locks` | Server control records | Server only |

Firestore reads return whole documents, so private values must never be placed in a public document. `scripts/migrate-v3.ts --verify` and the browser-bundle scan enforce this split.

## Retention

- Raw AI and AI failure records: delete after 90 days.
- In-progress sessions: expire after configured inactivity hours (24 by default).
- Identifiable learner records: retain through `studyClosedAt` plus `identifiableRetentionMonths` (12 by default), then pseudonymize identity while preserving aggregate research data.
- Audit logs: delete after the same configured post-study retention boundary.
