# Approved question bank: acceptance, 2 November 2026

**Firebase integration: PASS.** The configured `socratic-ai-a7765` default database now contains 120 approved questions. All 36 originals remain intact; all 84 additions and their associated documents match the approved source. This supersedes the earlier pending disposition for the expansion. No question wording, original approval, learning policy, access rule or application deployment was changed.

| Live approved coverage | Basic | Intermediate | Advanced |
|---|---:|---:|---:|
| Functions | 4 | 3 | 3 |
| Descriptive Statistics | 4 | 3 | 3 |
| Introduction to Probability | 4 | 3 | 3 |
| Probability Distributions | 4 | 3 | 3 |
| Introduction to Decision Making | 4 | 3 | 3 |
| Decision Analysis | 4 | 3 | 3 |
| Speaking Mathematically | 4 | 3 | 3 |
| Set Theory | 4 | 3 | 3 |
| Relations and Functions | 4 | 3 | 3 |
| Logic | 4 | 3 | 3 |
| Combinatorics | 4 | 3 | 3 |
| Discrete Probability | 4 | 3 | 3 |
| **Total** | **48** | **36** | **36** |

Every one of 36 topic/difficulty combinations meets the minimum of three. Before import, all twelve topics had 1/1/1. The live application readiness audit checked all 120 approval decisions, versions and scoring links, scoring snapshot hashes, private solution fields and forbidden public keys. [Readiness and actual matrix](readiness.txt).

**Content and approval.** The [84-question instructor source](../MINDGUIDE_84_Question_Expansion.json) has SHA-256 `5579cfa063b1cb640948662f0399acabd51ad8d6b8271d445390508e7cf93ce0`. The [owner confirmation](approval.json) applies to that exact source; the original 36 retain their own separate confirmation. Historical draft annotations remain in the private source snapshot. The active version-1 public status and validation/scoring records reflect the confirmed approval. The [source audit](../source-audit.json) and [fresh validation log](validation.txt) cover all 84 IDs, complete statements, expected answers, solutions, formulas/theorems, misconception guidance, stage mapping and all four scorecard criteria. All 120 statements were distinct after Unicode/case/whitespace normalization. No collisions, missing required fields, missing answers or solutions, or broken references were found. These are technical checks against the approved source, not a new academic review.

**Actual Firebase operations.** The [existing importer](../../../scripts/import-question-bank.ts) retains its staging-only guard for generic expansion apply. Its explicit approved-expansion mode requires the exact source and approval fingerprints, target and catalog. It uses the same document builder as the original importer. It records three batches of 336 protected documents, then creates all 84 public questions atomically. Only creates are used. Four separate audit receipts prove ownership and permit a safe retry. No learner documents are in the write plan.

1. [Original verified before import](original-before.json); [existing importer's read-only preview](preview.json); [exact final plan and backup receipt](backup-preview.json). All 1,092 candidate and four receipt paths were absent. All 468 original paths and update versions were captured. Private backup: `.local-backups/approved-expansion-2026-11-02-before.json` in the repository, SHA-256 `839c99ff77282e00d8abf8500efd0cd0d8f62aec936d994690b6495b5f541de5`. This file contains protected content and is excluded from Git.
2. [Apply and commit receipts](apply.json). Created 84 public question documents, 84 private solutions, 84 private source copies, 84 references, 588 prompts, 84 validations and 84 scoring documents. No staging database, emulator or deployment.
3. [Fresh independent process: verify](verified.json); [original source verification afterwards](original-after.json). All 1,092 actual new documents matched the expected fields **in full**, including ownership commit versions. All 468 original document versions matched the backup fingerprint `fb94b9b5071ea80e38720c62d368467a4d369f22200a63378b84f130759b9c9d`. [Second live apply](replay.json) made zero writes and confirmed the same four receipts.
4. Recovery: retain the private backup and receipts. After an interruption, inspect with the same source, approval, and `--approved-expansion`; then rerun the same apply. The importer refuses unexpected paths, a missing or edited owned document, changed original versions, and unexpected validation links. For reversal, the backed-up additions were absent; do not restore a whole database or delete published questions with dependent learner sessions. No rollback was run.

**Security and regressions.** The deployed-rules simulator passed 63/63 checks before and after import: [post-import cases](rules-after.json), [deployed source](rules-source-after.json). The suite exercised student/admin boundaries on the deployed rule text; this is distinct from a live role login. The 120 public documents passed the forbidden-field audit; solutions and scoring stayed in restricted documents. The production browser bundle contained none of the 12 server markers or 1,550 checked protected strings across 48 assets. [Expanded bundle scan](expanded-bundle.txt).

| Local check | Result |
|---|---|
| Type checking, ESLint, full Vitest, production build and standard bundle check | PASS: 550 tests in 51 files. Includes adaptive assignment, scorecard, authorization, integration and question-bank tests. [Full log](regression.txt) |
| Importer and QA audit strict TypeScript | [PASS](operator-types.txt) |
| Import collision, interruption, ownership, idempotence and publication gates | PASS in local transaction doubles, including 22 focused checks. [Log](operator-tests.txt) |
| Playwright chromium, production build on localhost | 15 passed; 29 skipped, including account/staging and manual coverage. [Full browser log](browser.txt). Authenticated manual evidence below is separate. |

**Authenticated browser and adaptive acceptance.** See the live results below. QA uses the owner's designated October learner and the normal application on localhost against the actual Firebase and tutor. Applications of topic-mastery-v1 to existing scored sessions and local fixture results are distinguished from a browser actually starting a recommended assignment.

| Requested adaptive case | Live result | Local service result |
|---|---|---|
| A. Three strong Basic completions → Intermediate | **PASS.** In Logic, the original `DM-04-B01` and newly completed `DM-04-B02` and `DM-04-B03` were three separate submitted, scored, statistics-committed sessions. The recommendation progressed from 1/3 to 2/3 to 3/3, then the browser actually opened the Intermediate `DM-04-I01`. Its saved assignment references precisely those three same-topic Basic sessions. | PASS |
| B. Three mixed Intermediate completions → maintain Intermediate | **BLOCKED live.** One Intermediate completion exists. Its decision is `maintain_insufficient_evidence`, not the requested `maintain_mixed_evidence`. The next assignment hit the shared daily limit. | PASS on the normal start operation using local history fixtures |
| C. Three weak Intermediate completions → Basic remediation | **BLOCKED live.** No qualifying sequence of three weak Intermediate completions exists for this QA learner. No weak scores were written or engineered to force a decision. | PASS on the normal start operation using local history fixtures |

[Opening QA inventory](qa-opening.json) · [Strong decision reconstructed from real sessions](strong-advance.json) · [Final QA history and assignment evidence](qa-final.json) · [Actual Intermediate assignment screenshot](live-intermediate-assignment.jpg) · [Local adaptive assignment cases](assignment-tests.txt).

Fresh Firestore read-backs are available for each step: [original Logic scorecard](historical-logic.json), [B02 before reveal](logic-b02-before-release.json), [B02 after submission](logic-b02-submitted.json), [B03 after submission](logic-b03-submitted.json), and [I01 after submission](logic-i01-submitted.json). B02 reached all gates while its protected solution was still unreleased, with zero scorecards and no committed statistics. The three new submissions each persisted exactly one matching 100/100 scorecard, an unlocked solution and committed statistics. The learner's completed-session count went from six to nine. The import itself created no learner history. The three new completions came only through the authorized QA account using the student interface.

The browser then displayed **Intermediate, 1/3 distinct completed Intermediate sessions**. The next assignment returned **HTTP 429** from the real backend. The persisted shared counter was **18/18** for the application's Los Angeles quota day, with the minute counter at 2 of 4 and 64,000 of 200,000 tokens. [Browser message](live-intermediate-quota.jpg) · [HTTP 429](server-errors.txt) · [Counter and saved sessions](qa-final.json). Retrying the same request before the daily reset cannot supply evidence. The configured day changes at midnight Los Angeles time (16:00 Manila on November 2). Across future quota windows, B and C still need distinct, naturally scored same-topic Intermediate evidence and verification of the actual next assignment. The policy, quota and existing learner records were not edited to force these outcomes.

Repeat-ID deduplication, same-topic/current-level filtering, exhaustion without promotion, and the mixed and remediation branches passed locally. Live A confirmed distinct IDs, correct topic, correct level and persisted evidence links; no duplicate was used. A post-expansion live repeat/exhaustion sequence was not forced. The quota rejection is **not** question exhaustion. This report accepts the **120-question integration and live strong-performance scenario only**; it does not certify the remaining two live workflows or authorize public deployment.

