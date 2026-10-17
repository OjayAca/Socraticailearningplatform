# Validated curriculum migration — 2026-10-16

## Source of truth and inspection

`src/data/validated-curriculum.ts` contains the exact user-supplied two subjects, twelve topics, and subtopics. Descriptive Measures retains its five nested children. Topic IDs follow the existing subject-prefixed slug convention; subtopic IDs include their ancestors.

Firestore stores top-level `subjects` and `topics`; topics reference `subjectId`. Subtopics are embedded in topic documents, avoiding a new collection/database architecture. Problems reference `subjectId` and `topicId`; formula/theorem references use `domain` and `supportedTopics`; prompts reference `problemId`; difficulty policies may reference a topic. Sessions snapshot subject/topic IDs and display names, with private references and message/response subcollections. Progress and assignment state preserve historical topic keys. Reports read saved history rather than rewriting its labels.

Catalog retrieval uses `getLearningCatalog` in `src/lib/learning-service.ts` through `secure-api.ts`. New server sessions and verified previews use `server/services/LearningService.ts`. Admin CRUD, dependency checks, validation and readiness use `src/lib/admin-service.ts`; editor and student selection use `ManagedContentEditor.tsx` and `SecureTaskStart.tsx`. Gemini receives canonical session context plus the validated subtopic scope.

## Migration behavior

Run `npm run migrate:curriculum` to inspect, `npm run migrate:curriculum -- --apply` to apply, and `npm run migrate:curriculum:verify` to verify. The script exclusively uses the existing project in `.env` and rejects demo projects/emulators. It also initializes an empty catalog with the same exact hierarchy; no database reset is required or performed.

Writes use one transaction with concurrent-edit checks and an ignored `.local-backups` before-image manifest. Stable document IDs and field comparisons make repeated runs no-ops. Obsolete subjects/topics and out-of-scope linked content are archived, never deleted or automatically relabeled/approved. No session, score, progress, private solution, validation evidence, or analytics record is rewritten. Pilot topic IDs become the validated list; pilot state, admission and AI configuration remain unchanged.

The original v3/v4/v5 sample-bank apply commands and temporary-topic creation command are retired. The old problem bank and generators remain explicitly historical test/migration fixtures, not approved content. Legacy names in saved-session parsing remain solely for historical compatibility. The new migration never invokes these generators.

Admin displays the complete nested hierarchy and prevents arbitrary curriculum additions, renaming, deletion and archival. Content editing/import/validation remain available using canonical topic IDs. Student catalog and new-session checks exclude old IDs even if stale records are marked approved. Typed input remains bounded to the existing central-tendency and counting operations under Descriptive Statistics and Combinatorics; other topics require actual prepared content. No mathematical content was fabricated.

## Live result

Applied to `socratic-ai-a7765`: two active subjects, six active topics each, exact subtopics. Archived one temporary subject and two temporary topics. All 43 existing sessions retained. There were no problems, formula/theorem references, Socratic prompts, difficulty policies or learning-progress documents in the inspected live collections. Therefore prepared questions remain unavailable until real content is imported and validated.

Verification after application reported zero pending changes. The total stored catalog includes the three archived historical documents intentionally; active counts are exactly 2 and 12.

## Validation

Unit/component checks cover exact topic ordering/counts, unique identifiers, nested measures, rejecting invented/mismatched curriculum, stable-ID typed routing, catalog filtering, admin editing and protections, prepared-question lookup, session workflow and historical compatibility. No live student session or synthetic content was created to test the application. Full-suite notification navigation and history subscription mocks had unrelated failures; see task report for final check results.

Final checks: 122 targeted tests passed across curriculum, admin service, student selection, verified problems, AI sessions, Spark assignment, legacy bank isolation, and answer editing. Typecheck, ESLint, production build, browser-bundle scan, and git diff whitespace checks passed. The full-suite run also exposed two failures outside curriculum code: notification navigation expectations and a missing `onSnapshot` export in the history-page Firestore mock. Authenticated live-browser interactions were not performed; no test learning sessions were written to Firebase.
