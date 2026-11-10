# Question bank integration — 25 October 2026

## Database result

Published **36 questions** to the existing `socratic-ai-a7765` Firebase project, following the user's explicit confirmation: “They have been academically approved; publish them.” The original source's pending-review metadata remains intact in protected provenance records. The publication evidence records the project owner's confirmation, not an invented faculty identity or an independently performed academic review.

| Measure | Result |
| --- | ---: |
| Source questions / imported / approved | 36 / 36 / 36 |
| Subjects / topics / topic-difficulty cells | 2 / 12 / 36 |
| Basic / Intermediate / Advanced | 12 / 12 / 12 |
| Initial skips / duplicates / missing answers / missing solutions | 0 / 0 / 0 / 0 |
| Repeat import skips / new writes | 36 / 0 |
| Verified content documents | 468 |

The atomic import created 36 `problems`, 36 protected `private/solution` records, 36 protected `private/import_source` records, 36 `formula_theorem_references`, 252 `socratic_prompt_bank` records, 36 `content_validation_records`, and 36 `problem_scoring` records, plus one audit log. No existing records were deleted or replaced. Existing users, sessions, progress, policies, AI settings and curriculum were preserved. A pre-write snapshot is in the git-ignored `.local-backups` folder.

The source subject “Quantitative Methods with Probability and Statistics” maps explicitly to the existing “Quantitative Methods” subject. All topic names and difficulty labels match existing catalog entries. Original subtopic labels remain in the private source and expected-concept fields; the approved curriculum taxonomy was not changed.

## Preservation and assessment

All 36 IDs, complete question statements, and final answers occur verbatim in both supplied files. The JSON is the structured import source. Its unchanged copy lives under `scripts/data`, outside the public assets and client imports. Source SHA-256: `f1fded3636d0514fb5f09ae29b7a2d2f65cdf3341a6225853a4cad36a5446dc0`.

Learner question text includes the original statement, assumptions and response instructions separated by blank lines. Unicode notation is preserved. No choices were supplied; these questions are classified as constructed responses. Full original records, including alternative methods, common errors, bibliography, qualitative scoring anchors and unresolved source notes, are retained in admin-only provenance documents.

Multi-part answers and explanations use the existing semantic `proof` answer contract: the supplied final answer becomes its conclusion and the supplied stage evidence becomes its requirements. This does **not** claim deterministic numerical validation of all 36 questions; the existing AI tutor assesses their reasoning against protected references. The importer does not invent numerical answer specifications, rubric weights or answers. Existing formative scoring and progressive release remain in effect, with calibration marked pending. Source A–F prompts map to the app's seven reasoning phases (A serves understanding and information identification); source prompts are included in the server-side tutor context.

## Implementation

- `scripts/question-bank-core.ts`: strict source validation, exact curriculum mapping, deterministic IDs, duplicate checks, public/private separation and source preservation.
- `scripts/import-question-bank.ts`: read-only inspection, atomic create-only import, approval evidence, content hashes, pre-write backup, concurrency checks and full field verification; reruns refuse to overwrite edited records.
- `scripts/data/E_MINDGUIDE_Problem_Bank.json`: unchanged supplied source, used by the importer and regression tests.
- `src/lib/learning/validation.ts`: accepts the already-supported semantic proof specification and optional question classification/import metadata through the admin editor.
- `src/app/components/ManagedContentEditor.tsx`: search and subject/topic/difficulty/type filters, imported count, missing-content flags, title/type/choice fields.
- `server/gemini.ts`: includes approved Socratic prompts in protected tutor context.
- `tests/unit/question-bank-import.test.ts`: source fidelity, 36-cell coverage, deterministic mapping, invalid-input rejection, and assignment-service retrieval of every question without public solution release.
- `docs/QUESTION_BANK_APPROVAL_2026-10-25.json`: source-bound user confirmation.
- `docs/QUESTION_BANK_IMPORT_2026-10-25.json`, `QUESTION_BANK_VERIFICATION_2026-10-25.json`, `QUESTION_BANK_RERUN_2026-10-25.json`: database operation evidence.

Existing student subject/topic selection, adaptive difficulty, solving sessions, scoring, progress and unlock controls are reused. Questions become available through prepared practice, rather than a second question-management module. Each topic has one question per difficulty, so availability is finite after all three are answered.

## Repeatable commands

Run from the repository root using the existing Firebase operator credentials:

```powershell
node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json
node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json --apply
node --import tsx scripts/import-question-bank.ts --source=scripts/data/E_MINDGUIDE_Problem_Bank.json --approval=docs/QUESTION_BANK_APPROVAL_2026-10-25.json --verify
```

Without `--approval`, the script prepares drafts and never fabricates validation evidence. An existing approved import must be verified using the same approval file. Faculty edits are managed through the existing admin workflow, which invalidates scoring publication until reapproved; the importer deliberately refuses to overwrite them.

## Verification

- **PASS — live database:** 468/468 expected documents match all mapped fields and source hashes; source objects retain all original fields. A second apply skips all 36 questions and performs no writes.
- **PASS — source comparison:** all 36 question statements and answers match the supplied HTML and JSON.
- **PASS — automated suite:** 435 tests across 42 files passed. A further assignment test covering all 36 imported questions was added afterward; all 75 targeted import/tutor tests then passed.
- **PASS — access-rule checks:** 63 checks compiled and passed using the rules simulator without Firestore writes. This tests the local rule file, not a new deployment.
- **PASS — type checking and lint:** initial typecheck, full lint, and subsequent changed-file lint passed.
- **PASS — live admin catalog:** authenticated browser reports 36 approved questions with matching scoring material and 36/36 topic/difficulty cells available.

- **PASS — production build:** completed with TypeScript checks. Existing React 18 deprecation and missing `metadataBase` warnings remain unrelated to the import.
- **PASS — browser secrecy:** standard bundle scan passed (47 assets); an additional scan of 44 JS/HTML/JSON assets found none of the 36 supplied final-answer strings, including their JSON-escaped forms.
- **PASS — refreshed admin UI:** live authenticated search plus all four filters returned exactly QM-08-B01. Its title, classification, original text, formula/definitions, worked solution and protected final answer loaded correctly. The UI reports 36 imported questions and zero missing-content flags. No approved record was edited during this read-only UI check.
- **PASS — deployed question security:** deployed-rules simulation confirms students cannot edit official questions or read protected solutions, published scoring references or session-private references. Admin private reads and approved question reads pass.
- **FAIL — unrelated deployed/local rules drift:** 60/63 deployed checks pass. Three existing account-management cases fail: audited academic-profile edits, anonymized-to-active transitions, and deactivated-to-suspended transitions. The local file passes all 63. No rules were deployed as part of this import; details are retained in `.local-backups/question-bank-deployed-rules.log`.

## Live student acceptance completed October 26, 2026

**PASS — QM-08-B01 through the local production build and real Firebase/Gemini services.** The signed-in student selected Descriptive Statistics and received the imported Basic question. Its text matched the public record, and its protected pinned reference matched the published scoring record. The initial question did not reveal its answer or solution.

Understanding and method responses advanced progress to 50%. An intentionally incorrect sum (45 instead of 35) was rejected as `computational_error`; computation required revision and later gates remained locked. A requested hint recorded one assistance event without revealing the answer. Corrected computation and contextual interpretation completed all seven internal gates and all four visible stages. Only then did the worked solution and formative scorecard unlock.

The session survived a local-server restart, resumed with its saved scorecard, and was submitted through **Finish session**. History displays the imported question as submitted with a score of 100. Read-only database verification confirms five response records (including the rejected computation), one persisted scorecard matching the session scorecard, assistance count 1, `statsCommitted: true`, and completed sessions increasing from 1 to 2. The four criteria scored 25/25 each; this is AI-supported formative feedback, not an official grade. The authorized QA attempt remains in the existing student's learning history.

Evidence:

- `QUESTION_BANK_STUDENT_CHECKPOINT_2026-10-25.json`: intermediate gates, unreleased solution and unchanged progress.
- `QUESTION_BANK_STUDENT_CORRECTION_2026-10-25.json`: rejected arithmetic, locked later gates and hint usage.
- `QUESTION_BANK_STUDENT_RESUME_2026-10-26.json`: saved scorecard before submission; progress still 1.
- `QUESTION_BANK_STUDENT_FINAL_2026-10-26.json`: submitted status, matching scorecard and progress 2.
- `QUESTION_BANK_STUDENT_HISTORY_2026-10-26.jpg`: browser history showing submission.
- `scripts/verify-question-bank-session.ts`: read-only verification utility; accepts `--session=<existing ID>` and optional `--report=<path>`. Changed-file ESLint passed.

Coverage is deliberately bounded: source/database fidelity and assignment-service retrieval cover all 36 questions; the live AI reasoning, hint, correction, unlock and submission workflow covers QM-08-B01. This does not claim independent live AI assessment of every question or academic rubric calibration. Existing responsive student components are reused; a separate mobile-device acceptance run was not performed.

No remote application deployment or rules deployment is implied by the database import. The local server on port 5173 runs the verified production build. The three unrelated deployed-rule failures above still require separate remediation before claiming overall release readiness.
