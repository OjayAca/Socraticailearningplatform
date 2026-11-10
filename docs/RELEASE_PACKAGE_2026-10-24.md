# MINDGUIDE release package — 24 October 2026

Status: **NOT VERIFIED**. This is a review package, not deployment authorization. See the latest section of LIVE_QA_REPORT_2026-10-22_REMEDIATED.md for executed checks and the 48-case matrix. Earlier reports remain historical evidence.

## Decisions recorded in this chat

- Product owner requires administrator academic-profile editing at launch: course, year level, section only. Values are trimmed, nonempty, at most 100 characters; control characters rejected. Reason is 8–1000 characters. Student number, name, email, role, status and profile-completion flag cannot be changed by this operation. Existing non-anonymized student profiles only. No academic identity is fabricated for an incomplete account.
- Scoring assesses **final demonstrated mastery**, with assistance disclosed separately. Earlier corrected mistakes do not cause automatic deductions. This decision does not certify model calibration or approve content.
- Keep existing provider allowance. Strong/weak live sequences remain pending across quota windows. Do not enable billing or increase limits.

## Implemented changes

- Opening dialogue asks for the goal and givens, after validating the provider output and checking it for answer leakage. Opening never accepts a gate; retry, quotas and mathematical validation remain intact.
- Tied criteria no longer create a fabricated relative strength/weakness. Growth text uses saved advice. Empty/None advice and full-score criteria do not generate an improvement plan. Four 0–25 criteria and total aggregation are unchanged.
- CSV includes stable headers even for empty reports. Pseudonymized session IDs are hashed because original IDs contain learner UIDs. Learner names remain restricted to explicit administrator identity exports. All matching records, rather than the visible page alone, are exported.
- CSV download attaches its anchor, removes it after click and delays Blob URL revocation for 60 seconds. This is defensive lifecycle handling; the earlier delivery timeout is not proven to have been caused by immediate revocation.
- Academic-profile editor uses the existing admin operation path and a Firestore transaction. The profile and append-only audit event commit together. Rules check the three-field allowlist and matching audit actor, target, action, timestamp and reason. Replayed edit IDs cannot overwrite a newer edit. Current deployed rules must be updated before live saves can succeed.
- Release preflight checks every fixed curriculum topic/difficulty cell, including missing approved topic documents, rather than only selected concept names.
- Dependency lockfile updates and scoped gRPC override are described in DEPENDENCY_AUDIT_2026-10-24.md.

## Approved-content readiness checklist

Read-only current-project preflight on 24 October: **0 approved ready problems; 0/36 cells covered**. No content was seeded, approved, assigned or published by this work. The following is a review checklist, not draft teaching material or approval.

| Subject | Exact topic | Basic | Intermediate | Advanced |
|---|---|---|---|---|
| Quantitative Methods | Functions | Missing | Missing | Missing |
| Quantitative Methods | Descriptive Statistics | Missing | Missing | Missing |
| Quantitative Methods | Introduction to Probability | Missing | Missing | Missing |
| Quantitative Methods | Probability Distributions | Missing | Missing | Missing |
| Quantitative Methods | Introduction to Decision Making | Missing | Missing | Missing |
| Quantitative Methods | Decision Analysis | Missing | Missing | Missing |
| Discrete Mathematics | Speaking Mathematically | Missing | Missing | Missing |
| Discrete Mathematics | Set Theory | Missing | Missing | Missing |
| Discrete Mathematics | Relations and Functions | Missing | Missing | Missing |
| Discrete Mathematics | Logic | Missing | Missing | Missing |
| Discrete Mathematics | Combinatorics | Missing | Missing | Missing |
| Discrete Mathematics | Discrete Probability | Missing | Missing | Missing |

For **each** problem, content owner and authorized academic reviewer must record:

1. Exact subject/topic/subtopic from src/data/validated-curriculum.ts, intended difficulty, syllabus reference and content-matrix item. Do not add or rename curriculum topics to satisfy a test.
2. Reviewed statement, all givens/assumptions, unambiguous requested result, notation and accessibility review.
3. Private worked solution, final answer, interpretation, expected concepts, mathematical answer specification, applicable formulas/theorems and their conditions. Approved linked instructional references and approved matching subject/topic are required.
4. Rubric material explaining observable evidence for accuracy, logical validity, method selection and explanation quality; accepted alternative methods; known misconceptions and stage-appropriate help.
5. Genuine reviewer name/role/date, evidence reference/hash and approval decision through pending-validation → recorded-approval workflow. Approval problemId/problemVersion, scoring problemVersion/validationRecordId and scoring snapshot hash must agree.
6. No protected answer fields in public problem documents. Editing a published problem invalidates its scoring reference; re-review and approve the new version before assignment.
7. Read-only preflight passes, browser assignment selects that approved version, and the learner cannot read the private reference before the solution gate.

One problem per cell is minimum catalog coverage, not sufficient adaptive test inventory: completed/attempted problem IDs are excluded from future curated assignment. Supply enough distinct genuinely approved variants for the intended sequences and subsequent assignments.

Existing preflight also names pigeonhole, mean, variance and regression as concept checks. These are inherited checks, not permission to expand the validated curriculum. Academic owner must map any intended concept to an already allowed subtopic or explicitly resolve a scope conflict; do not invent a new topic or approval.

## Scoring calibration decision sheet

| Question | Decision / remaining evidence |
|---|---|
| Final mastery versus history | User selected final demonstrated mastery on 24 October. Preserve history for explanation and audit. |
| Corrected mistakes | No automatic penalty for earlier corrected errors. Final learner work must independently support each score. |
| Assistance | Disclose assistance count and saved support history separately. Tutor-provided reasoning cannot count as learner evidence. No new assistance penalty. |
| Full marks | 25 in a criterion requires fully supported learner evidence for that criterion. Gate completion alone is insufficient. |
| Accuracy evidence | Correct learner calculations/results and checks, referencing actual learner message IDs. |
| Logical validity evidence | Valid inference/proof and justified conditions in learner messages. |
| Method selection evidence | Appropriate method plus why it fits the givens. |
| Explanation quality evidence | Clear learner explanation and contextual interpretation. |
| Ties | No single relative strength/weakness when all scores tie; retain per-criterion feedback. |
| Calibration approval | Still required: academic reviewer evaluates scored examples, evidence alignment, consistency across subjects/difficulties and disagreement handling. Do not mark ai-formative-v1 calibrated merely because the user chose a policy. |

Potential policy tension: learners must demonstrate all four gates before scoring, and recovered errors are not penalized. A legitimate completed low-mastery sequence may therefore be difficult to obtain. Academic reviewer must determine whether the existing below-50 difficulty-decrease criterion is reachable and educationally appropriate under final-mastery scoring. Do not manufacture low scores, weaken gates or alter thresholds to demonstrate it.

## Adaptive sequence protocol and capacity

Algorithm: eligible records have workflowVersion 6, committed statistics and scorecards. Most recent five eligible topic-specific records are considered; at least three are required. Accuracy is accuracy score ×4. Reasoning is the average of the other three scores ×4. Either average below 50 lowers one level. Both at least 80 raise one level only when a majority did not use stronger_hint/partial_step. Clamp to Basic/Intermediate/Advanced. Assignment chooses the nearest available genuinely approved, unanswered level and explains a fallback. Missing valid content fails with 422 before provider use.

Live evidence: **pending**, not simulated completion. Existing dedicated learner has historical work and does not provide two isolated histories. Obtain two authorized dedicated accounts without resetting existing histories. Complete three legitimate sessions per account, save each session ID, scorecard evidence, assistance history, submitted status, recommendation and next assigned problem/version. Retain incomplete sessions as a negative threshold check. A Basic weak sequence can establish the lower clamp but cannot demonstrate an actual decrease; reviewer must supply a legitimate Intermediate starting context if that decrease is mandatory.

Configured allowance: 4 reservations/minute, 200000 estimated tokens/minute, 18 reservations/day. Each normal completed session reserves opening + four accepted-stage assessments + scoring = **6 calls minimum**. Six sessions = **36 minimum**, plus two next-assignment openings = **38**, before mistakes, hints, reassessment and failures. A weak path with one correction per session adds at least 3; stronger help requires additional attempts and calls. At the existing allowance this requires **at least three daily quota windows** for the complete assignment-inclusive protocol, assuming no shared usage. Use sequential calls and inspect actual quota availability; do not assume all 18 calls are available. Failed reserved requests and bounded intent reassessment also consume allowance. No quota/configuration changes were made.

## Deployment prerequisites and environment

Operator must approve deployment separately. Use only the existing Firebase project socratic-ai-a7765, and the existing secret-managed environment. Required names (never values): existing VITE_FIREBASE_* / NEXT_PUBLIC_FIREBASE_* public configuration; server GEMINI_API_KEY, GEMINI_MODEL, AI_ENABLED, AI_FREE_TIER_CONFIRMED, GEMINI_RPM, GEMINI_TPM, GEMINI_RPD; existing Firebase operator/server credential mechanism. Do not expose server credentials through NEXT_PUBLIC_* or browser bundles.

Provide and verify the intended HTTPS origin and Node hosting target. metadataBase is currently unresolved; app/layout.tsx still resolves relative social images against localhost during local builds. Set metadataBase to the verified HTTPS origin in a reviewed change before release. No origin is invented here. This application needs a Node server for /api/learning; static hosting alone is insufficient.

No data migration or reset is required for these changes. Profile edits add audit linkage only when an authorized edit occurs. Do not run historical migration/reset scripts. Preserve all learner sessions, scorecards, approvals and audit history.

## Operator deployment sequence (not executed)

1. Resolve content, calibration, live test and HTTPS-origin gates. Save an immutable reviewed release revision and lockfile plus the previous deployed application artifact and rules source/version. Record current project and hosting target without secrets.
2. Install with npm ci in the release environment. Run npm run check, npm run test:rules, npm run audit:prod, npm run release:preflight and authenticated E2E/manual acceptance. Rules checks use the remote simulator without database writes; they do not deploy rules.
3. The existing test:e2e:staging guard requires dedicated credential secrets and a base URL and refuses the named production hostname. Do not bypass this guard or switch Firebase projects. Use the authorized manual browser protocol against the configured project unless a separately approved test execution arrangement satisfies that script.
4. After explicit deployment authorization, deploy the reviewed rules with `npx firebase deploy --only firestore:rules --project socratic-ai-a7765`. Retain the exact previous rules artifact. Do not deploy indexes, functions or unrelated resources through a broad deploy command.
5. Deploy the reviewed Next Node artifact through the chosen host's reviewed pipeline with existing secret management. Exact host command is pending the hosting-target decision. Use npm run build and npm start; npm run preview is local-only on localhost:4173.
6. Record deployed revision, HTTPS URL, rules release/version and timestamp. Complete smoke tests below before acceptance. A local build is not a deployed verification.

## Post-deployment smoke tests

- Fresh dedicated student and administrator sign-ins; student excluded from admin routes; inactive learner denied; restore dedicated account to original Active state.
- Mean and Logic: understanding → justified method → correct working → interpretation → solution gate → four-criterion persisted scorecard → finish → logout/login → reopen. Compare dashboard, history, admin detail, progress/scorecard reports. Reject incorrect and irrelevant responses without advancing.
- Expired/incomplete sessions preserve reasoning and do not claim a nonexistent scorecard.
- Approved content assignment/version integrity; draft creation/edit/version/archive/delete-cancel only on an authorized disposable draft.
- Academic-profile edit saves only approved fields with same-transaction audit; identity/status/history remain unchanged. Unauthorized/direct identity edit denied. Restore test academic values.
- Download and inspect real CSV: exact headers, filtered rows/statuses/subjects/totals, pseudonymization and header-only empty file. Compare print view to preview. An export audit event alone is insufficient.
- Confirm no browser secret exposure; sanitized provider diagnostics; deterministic fault-injection suite passing for replay/concurrency/invalid output/quota/recovery.

## Rollback preserving learner data

If smoke tests fail, stop rollout and use the previous reviewed Node artifact and lockfile through the host rollback mechanism. Restore the previous rules artifact only after checking that it preserves ownership, inactive-user denial and private scoring protection. Never restore a database backup over newly created learner work and never reset scores, quota documents or approvals. New profile audit linkage can remain stored safely; an older UI can ignore it. Disabling the new edit UI through application rollback is preferable to deleting edit/audit records. Retest sign-in, history and saved scorecard retrieval after rollback. Document the failed revision and reason.

## Remaining blocker owners and acceptance evidence

| Owner | Exact action | Acceptance evidence |
|---|---|---|
| Content owner + academic reviewer | Review and genuinely approve version-consistent problems in all 36 cells and enough variants | Preflight clean; approved reference snapshots; real next assignment |
| Academic reviewer | Calibrate final-mastery rubric and resolve low-score/adaptation tension | Reviewed example scorecards with criterion evidence and signed calibration decision |
| QA + account owner | Normal UI sign-in with dedicated learners; retain separate histories | Fresh 48-case evidence and post-login scorecard persistence; no credential disclosure |
| QA + capacity owner | Complete sequences across existing quota windows | Six legitimate completed histories and two approved next assignments; no quota bypass |
| Release operator | Supply verified HTTPS origin/host, approve app/rules deployment | Deployed revision/rules identifiers plus smoke evidence |
| QA | Independently verify downloaded CSV bytes | Actual saved file, filters, headers/rows and empty dataset evidence |

