# MINDGUIDE Capstone Manuscript Amendment Guide

This guide supplies the exact implementation facts that must replace inconsistent Chapter III claims. Apply the edits to the source manuscript after it is provided; do not claim academic or production evidence that has not been captured.

## Database design, ERD, and Tables 5–21

Replace the table-oriented structures `Student_Profile`, `Session_Steps`, `Student_Responses`, `AI_Interaction_Logs`, `Error_Diagnosis_Logs`, `Critical_Thinking_Scorecard`, and `Adaptive_Difficulty_Records` with the deployed Firestore paths below.

| Manuscript concept | Schema-v4 implementation |
|---|---|
| Student profile | `users/{uid}` with display identity, role/status, preferences, `academicProfile.studentNumber`, `course`, `yearLevel`, `section`, and completion metadata |
| Consent | `users/{uid}/consents/{version}` |
| Curriculum | `subjects/{id}`, `topics/{id}` |
| Validated problem bank | `problems/{id}` plus protected `problems/{id}/private/solution` |
| Academic validation | protected `content_validation_records/{id}` linked by `problems.validationRecordId` |
| Formula/theorem configuration | protected `formula_theorem_references/{id}` |
| Socratic prompt configuration | protected `socratic_prompt_bank/{id}` |
| Misconception configuration | protected `misconception_categories/{id}` |
| Adaptive configuration | protected `difficulty_policies/{id}` |
| Learning session | `sessions/{id}` |
| Version-pinned evaluator reference | protected `sessions/{id}/private/reference` |
| Learner responses and diagnoses | `sessions/{id}/responses/{id}` |
| Scorecard | `sessions/{id}/scorecards/final` plus the safe session projection |
| Progressive unlock evidence | `sessions/{id}/unlock_events/{id}` |
| Raw AI evidence | protected `sessions/{id}/private_ai/{id}` |
| Progress and recommendations | `learning_progress/{uid}` |
| Non-repeating assignment state | server-only `learning_progress/{uid}/assignment_state/{topicId}` |
| Notifications and audits | `notifications/{id}`, protected `audit_logs/{id}` and `ai_failure_logs/{id}` |

Use the ERD in `DATA_DICTIONARY.md`. Explain that Firestore subcollections replace several proposed standalone relational tables and that private solution/evaluator data is separated because Firestore returns whole documents.

## Administrator-managed module behavior

Replace any claim that a saved administrator record immediately changes every active interaction with:

> Approved administrator-managed formula/theorem references, seven-phase Socratic prompts, misconception corrective prompts, and adaptive-difficulty thresholds are resolved when a new session starts. MINDGUIDE stores their IDs and versions in the public session projection and stores the resolved evaluator material in the protected session reference. Later edits apply only to new sessions, preserving reproducibility for active and historical sessions. Deterministic mathematical and security rules remain application code and cannot be replaced with administrator-supplied executable logic.

Problem approval uses `draft → pending_validation → approved/rejected → archived`. Approval is available only through an immutable external faculty-validation decision after the protected solution, approved topic, references, and seven prompts are complete.

## Learner catalog and adaptive assignment

Replace the fixed-topic-interface description with:

> The learner catalog is generated from approved `subjects` and `topics` records. Formal-evaluation sessions remain disabled until all 99 required problem variants are faculty approved. For curated practice, the server selects the adaptive difficulty and transactionally rotates among three validated variants to prevent immediate repetition. Learners do not choose a prepared problem directly.

Clarify the free-form boundary:

> A learner-entered problem retains its intrinsic requested difficulty because MINDGUIDE cannot substitute another question. The adaptive mechanism changes Socratic scaffolding for free-form work. Adaptive problem selection and non-repeating variant assignment apply to the validated curated bank.

## Student_Profile fields

List `studentNumber`, `course`, `yearLevel`, and `section` as required bounded text fields. They are collected through a server-validated profile-completion step before the first session, are not copied into learning-session documents, and are readable only by the student and authorized System Administrators. Do not state that an institutional student-number format or uniqueness rule is enforced unless the University supplies that rule.

## Table 18: Critical Thinking Scorecard

Replace the criteria with four equal 25-point dimensions:

1. **Accuracy** — mathematical equivalence to the protected validated answer.
2. **Logical validity** — accepted computation/proof and verification gates, adjusted for corrective cycles.
3. **Method selection** — accepted method selection and formula/theorem justification.
4. **Explanation quality** — accepted understanding, relevant-information, justification, and contextual-interpretation evidence.

Each criterion stores score, evidence, reason, improvement advice, confidence, and source. The total is formative and is not an official course grade.

## Gemini and deterministic scoring

Replace statements saying Gemini generates the final scorecard with:

> Deterministic validation first rejects blank, malformed, irrelevant, unsupported, mathematically invalid, future-phase, or stale responses. Gemini is used only for otherwise plausible but semantically ambiguous reasoning-gate evaluation. The final four-part scorecard is computed deterministically from accepted gates, correction cycles, the saved final response, and mathematical answer checking.

## Academic-validation claim

Do not state that the problem bank is validated merely because a Firestore status is `approved`. Valid evidence requires:

- an official syllabus or course-outline reference;
- an approved content-matrix item;
- faculty validator name and role;
- validation date and approve/reject decision;
- an evidence document reference and integrity hash.

Schema v4 creates 99 repository records, but the 66 generated parallel records are explicitly drafts. Formal evaluation remains blocked until faculty verifies or replaces those drafts and all 99 immutable approval records exist.

## Production-readiness wording

Use “repository implementation complete; academic validation and project-owner release gates pending” until the preflight report and external evidence are attached. Required external evidence includes billing/APIs, least-privilege IAM, App Check, Secret Manager and credential rotation, managed export/restore, staging migration, authenticated smoke tests, privacy dates, latency, approved release tag, and production deployment checks.
