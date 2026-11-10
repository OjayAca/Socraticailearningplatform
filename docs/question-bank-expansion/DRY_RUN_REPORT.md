# 84-question expansion — inspection and dry run

**1 November 2026, Manila. Staging import blocked.** Read-only catalog inspection found exactly the 36 original approved questions. All 84 candidates passed structural validation. Zero were rejected by the schema, imported into staging, approved, or published. There were no database writes. The only additions from this inspection are local source copies, reports, an offline inspector, and an admin component test.

## Bank reconciliation

| Bank | Basic | Intermediate | Advanced | Total |
|---|---:|---:|---:|---:|
| Current approved bank | 12 | 12 | 12 | 36 |
| Proposed new drafts | 36 | 24 | 24 | 84 |
| Combined if staged | 48 | 36 | 36 | 120 |

All 12 topics have the same distribution. Each gains 3 Basic, 2 Intermediate and 2 Advanced, bringing its proposed totals to 4, 3 and 3. Both subjects have 6 topics. The verified Firestore paths are under `subjects/discrete-mathematics` and `subjects/quantitative-methods` for the subject documents, and `topics/{topicId}` for the topics. The catalog readback records every actual topic ID, parent, approval state and enabled flag. [Catalog readback](catalog-readback.json) · [Per-topic counts and per-question validation](source-audit.json)

The instructor expansion alone was passed to the existing importer in inspect mode, with no approval file. The 120-file served only as a cross-check. Each of its 36 original objects matched the repository source in full and each of the 84 added objects matched the instructor expansion. The original approval evidence matches the hash of the 36-file only. The original draft labels in the combined source do not supersede those approvals. Read-only verification found all 468 expected original documents with matching importer fields. All 924 candidate paths were absent. No candidate scoring record or validation for a candidate problem ID was found. [Original verification](original-36-verification.json) · [Importer inspection](importer-inspect.json)

There are 84 distinct new IDs, no overlap with the 36, and zero duplicate normalized problem statements across all 120. This checks text identity after Unicode, case and whitespace normalization. Semantic similarity is an academic review item. All four requested JSONs came from the supplied ZIP and were read outside the public asset directory. The source audit records their SHA-256 hashes. The attached validation report was compared with independently computed counts, and its author checks were not treated as an approval.

## Source and schema checks

The existing adapter resolves the supplied quantitative methods subject alias and links to the verified topic ID. Every candidate has an allowed difficulty value, a rationale, and a classification consistent with its source ID. All 84 have nonempty student statements, givens and instructions, expected final answers and reasoning, references, and 3–8 worked steps (393 total). Each has two misconception entries with corrective prompts (168 total), qualitative references for all four scorecard criteria, and exactly six A–F stages with questions and expected evidence. The adapter maps those stages to the seven application phases by using A for both understanding the problem and identifying relevant information. All 588 mapped prompts passed the application's prompt schema. No scoring weights or learner data were created.

The student file matched the instructor file by ID and value for exactly eight allowed top-level fields and exactly three nested text fields. The adapter builds problem text exclusively from those three strings. Expected answers, steps, stage evidence, misconceptions and hidden scoring anchors stay in the private solution or import source. The technical checks establish presence, mapping and separation. Independent mathematical correctness, instructional adequacy and difficulty calibration remain pending for all 84.

Two examples merit reviewer attention. `DM-04-I02` asks the learner to symbolize an argument, while its public assumptions already supply the symbolic premises and conclusion. `QM-12-I03` mixes the stock decision and demand state in one payoff sentence, and its assumptions supply an intermediate probability. Review the student wording and intended amount of help. Across all 84, there is only one distinct question string per source Socratic stage. The expected evidence varies by record. Review whether those generic prompts are sufficient for each question. No source wording was changed.

## Firestore layout and lifecycle

| Existing path | Draft plan | Access / purpose |
|---|---:|---|
| `problems/{id}` | 84 | Version 1, status `draft`, existing subject/topic IDs, question text and source fingerprint |
| `problems/{id}/private/solution` | 84 | Protected solution, answer specification, reasoning and prompts |
| `problems/{id}/private/import_source` | 84 | Full instructor source, metadata and source hash |
| `formula_theorem_references/{referenceId}` | 84 | Draft instructional references |
| `socratic_prompt_bank/{promptId}` | 588 | Seven draft prompts per ID |
| `content_validation_records` / `problem_scoring` | 0 | No approval decisions or scoring snapshots for new questions |
| **Total planned content documents** | **924** | Import audit entries would be separate |

The application uses `draft`, `pending_validation`, `approved`, `rejected`, and `archived`. Submission for review moves a draft to `pending_validation`. Curated learner availability requires `approved` with a matching versioned validation and scoring record. There is no separate published flag for these problems. New candidates must start as drafts. Pending academic review remains explicit in the protected source.

## Security, selection and administration

The authenticated `POST /api/learning` route uses the server LearningService. Curated preparation filters by exact topic, recommended difficulty and approved status, skips attempted IDs, and verifies the validation decision, question version, scoring reference, and source hash when present. A separate client practice query also filters approved status, topic and difficulty. Firestore rules restrict problem-private documents, scoring, validation, instructional references and the prompt bank to their authorized roles.

| Check | Result |
|---|---|
| TypeScript and ESLint | PASS |
| Existing Vitest suite | PASS — 499/499 across 46 files, including importer, duplicate, API, admin, mastery and exhaustion tests |
| Expansion admin editor test | PASS — 1 additional test using the real editor and four supplied questions with mocked reads. Filters reduced the list from 4 to 3 to 2 to 1. The test checked draft and pending controls, the protected answer and worked steps. No review decision submitted. |
| Deployed Firestore rules | PASS — 63/63 simulator checks on deployed rules, including denying student draft, private solution and scoring reads and permitting authorized admin solution reads |
| Draft-only and pending-only catalogs in the server selection path | PASS — all 24 in-memory entry-level checks (12 topics × 2 statuses) returned `question-bank-exhausted` |
| Explicit student session response allowlist | **FAIL** — the active server projection copies every root field except `gateStates`. A local marker inserted into `instructor_only` and `sourceGuidance` came back in both fields. This test shows what would happen if unexpected fields reached a session. It did not read an actual learner session or establish a real disclosure. |
| Authenticated staging admin and learner workflows, actual staged count, retry and rollback | **BLOCKED** — no verified staging target or safe apply path for this batch |

The browser-side `src/lib/learning/projection.ts` enumerates session fields. The active server path calls the different `projection` in `server/gemini.ts`. Implement an explicit version-appropriate server allowlist, including nested objects and gated solution release, then test unknown fields on normal, resume and replay responses. Keep the private reference separate. [Rules results](deployed-rules-results.json) · [Rule source tested](deployed-rules-source.json) · [Student boundary probe](student-boundary-probe.json)

For curated questions, `topic-mastery-v1` uses completed, committed, scored sessions of the current workflow, topic and difficulty. It deduplicates by problem ID, keeps up to five distinct results, and needs at least three before advancement can occur. A repeat does not add another distinct curated completion. Exhaustion leaves the level unchanged. The existing policy also uses the session ID when a problem ID is absent, as in custom practice. The distinct-ID conclusion here applies to the curated bank. Existing tests cover cross-topic and cross-level exclusion, repeated IDs and exhaustion. No real mastery or history documents were read for this audit or updated. The scorecard, quotas and adaptive policy were untouched.

## What blocks the staging import

1. The workspace configures `socratic-ai-a7765`, the project excluded by the repository's staging preflight. There is no verified separate staging target here. That preflight checks browser configuration and accounts, but does not attest the backend database. Verify the actual non-production project/database and catalog with independent target configuration and staging-scoped credentials before proposing any write.
2. `scripts/import-question-bank.ts` supports draft shapes and conservative, create-only writes with conflict checks. Its apply mode targets the configured default database, accepts approval input, and refuses more than 480 missing documents. This expansion requires 924. The current importer also hardcodes the original bank's `importSource` label. The admin bulk form expects another DTO and uses upserts. Neither is a safe apply path for this expansion.
3. Adapt the **existing** importer with a staging-only draft mode once this work resumes. Reject approval evidence, the original/combined source and unexpected IDs. Pin the expansion fingerprint and actual staging catalog. Preserve the original 84-file metadata and provenance across bounded transactions. Two groups of 42 would each contain 462 content documents before audit/manifest writes. Use create preconditions, conflict checks, explicit run ownership and resumable per-chunk verification. Reinspect all paths after a failure, skip only proven identical records from the run, and refuse unexplained partial or edited records. Test rerun and rollback on verified staging before declaring either demonstrated.
4. Close the server response allowlist finding above before staging acceptance. Rerun role-based access, normal learner selection with approved originals alongside drafts, and authenticated admin review against that staging target. The actual staging impact must be shown to the owner and confirmed before any apply.

## Rollback

There is nothing to roll back from this inspection. For a future staging import, capture the target, source hash, pre-import state, created paths and committed document versions in a run-specific manifest. A backup of candidate data alone is insufficient. A rollback dry run must refuse the configured production target and enumerate **only** paths created by that staging run. Check versions, hashes, draft status, subsequent edits, validation decisions and references before deleting anything. Stop on any difference or dependency. Delete only unchanged run-owned documents using checked transactions, including both private child documents explicitly. Preserve audit logs and pre-existing identical documents. Verify candidate paths are gone, compare all original 36 and their protected records with the pre-import baseline, and record the outcome. Do not restore a whole database or touch learner records. This procedure has not been executed.

## Reproduce the read-only inspections

Run from the repository root. These commands do not enable apply mode. The original evidence file is used only to verify the original 36.

```powershell
node --import tsx scripts/inspect-question-bank-expansion.ts
node --import tsx scripts/import-question-bank.ts --source=docs/question-bank-expansion/MINDGUIDE_84_Question_Expansion.json
node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json --verify
npm run test:rules -- --deployed
```

The work stopped before a staging import. No publication, commit, push or remote deployment was performed.
