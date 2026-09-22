# AI implementation and verification status

Status as of 2026-09-21: implemented workflow v6; rollout blocked. **Do not claim that all six features have been demonstrated with real learning configuration.**

## Implemented

| Requirement | Implementation | Remaining live evidence |
| --- | --- | --- |
| Socratic solver | Persistent Gemini conversation, four stages, seven server gates, answer/question/help intents | Full sessions on approved content |
| Method justification | Required method and conditions gate, alternative-method prompt, proof reference specification | Instructor-reviewed examples and alternative proofs |
| Misconceptions | Structured diagnosis/evidence, corrective questions, numerical-conflict handling | Real wrong-formula, proof, variance and regression cases |
| Adaptation | Three-session minimum, five recent AI sessions, accuracy/reasoning/assistance thresholds, nearest-level explanation | Approved bank with available levels |
| Progressive unlock | No hints complete a gate; escalating help; all gates and evidence-linked scoring before release | Assisted and independent real completions |
| Scorecard | Four criteria out of 25, saved learner evidence, assistance, formative label, separate model call | Live calibration and quality review |

Authority is enforced in the Worker and proposed Firestore rules. The browser cannot directly create AI sessions, evaluations, scorecards or progress. Legacy published answer references become administrator-only. Request IDs, session revisions, document update-time preconditions, per-student leases and shared quotas prevent duplicate advancement and unsafe concurrent commits. A new test verifies drafts changed during reservation are not overwritten.

## Deployed versus local

- Free Worker deployed at `mindguide-socratic-tutor.mindguide.workers.dev`; latest version `5bafd993-d0eb-44a1-81e8-9dde2ba08a17`, including consolidated launch-blocker reporting.
- Gemini/service-account secrets installed; Firebase service account uses restricted datastore permissions without deletion, billing or IAM administration.
- `AI_ENABLED=false`. No student AI pilot has opened. No billable upgrade was enabled.
- Authentication, existing account status and Firestore connectivity passed a live operator health request. Bounded arithmetic check passed.
- Gemini produced valid structured output from the local probe earlier. For Worker requests, single automatic 503 retry (with 2s wall-clock delay), explicit network error catching, and Smart Placement (`placement: { "mode": "smart" }`) have been implemented to resolve connection reliability issues. Live Worker AI reliability is pending post-deploy probe verification.
- CPU optimizations implemented: module-level schema caching in validation.ts, pre-stringified JSON schemas and character-length guard in tutor.ts, and module-scoped service-account JSON + imported RSA CryptoKey caching in platform.ts. Full authenticated session CPU feasibility remains to be measured via Cloudflare Metrics on the next deployment.
- React changes and coordinated Firestore rules are local. They have **not** been deployed while release readiness fails. Existing hosted learning behavior is therefore not yet the new AI workflow.
- The Gemini notice `privacy-2026-07-18-gemini-v1` is now published and active in the existing Firebase project. The live preflight confirms the notice blocker is resolved. Learners must acknowledge this new version themselves.

## Checks

- Application and Worker TypeScript checks, lint, production build and browser private-material scan passed during implementation.
- All 215 unit/component tests passed, including draft-reservation races, clarification preservation and help progression.
- Eight public browser tests passed, including desktop/mobile route protection and navigation.
- Hosted rules compilation and all 45 access checks passed without database writes or an emulator.
- Worker bundle: approximately 631 KiB raw / 103 KiB gzip.
- Real content preflight correctly fails release readiness. No fixtures were seeded into Firebase.

## Exact rollout gaps

1. Existing Firebase contains **zero approved problems**. Approved topics currently cover Measures of Central Tendency and Counting Principles, but there are no ready Basic, Intermediate or Advanced problems. No ready Pigeonhole, mean, variance or regression references are available.
2. Privacy publication is resolved: `privacy-2026-07-18-gemini-v1` is active with `aiProcessingVersion=gemini-free-v1`. Learner acknowledgement remains required. Existing retention remains 90 days for raw AI logs and study closure plus 12 months for identifiable learning records, followed by anonymization. Retention cleanup remains an operator task.
3. The operator's learner account is admitted, and topic access is configured for the two genuinely approved topics, on the user's explicit request. Both changes have audit records. No other learners were admitted. The separate AI backend switch remains disabled; these access settings alone do not establish live readiness.
4. Live Worker Gemini reliability and CPU feasibility are unproven. The observed AI Studio daily limit is 20 requests; configured headroom is 18, enough for at most two minimal nine-call sessions before additional help/retries.
5. Full four-topic sessions, qualitative acceptance of alternative proofs/paraphrases, injection resistance and live assisted scoring remain acceptance work, not completed claims based on mocks.

Follow [AI setup and rollout](AI_TUTOR_SETUP.md). Supply genuine instructor-reviewed questions, worked references and approval evidence; do not manufacture approvals or substitute a sample bank.
