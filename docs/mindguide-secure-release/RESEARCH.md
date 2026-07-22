# MINDGUIDE Secure Release Research

## Overview

MINDGUIDE must move from a browser-authoritative localhost pilot to a server-authoritative Firebase capstone release without losing existing learner history.

## Evidence From the Baseline

- The React application performs Gemini requests, phase advancement, scoring, hint unlocking, and statistics writes in the browser.
- Firestore rules allow students to update authoritative session fields while a session is in progress.
- Prepared problem solutions and free-form reference answers are readable by the frontend.
- The implementation retains seven precise internal gates while grouping them into four learner-visible stages; diagnosis runs after every response and the scorecard precedes solution release.
- The existing administrator interface supports session monitoring and review but not managed content, users, reports, audits, privacy operations, or maintenance.
- Typecheck, lint, unit tests, emulator rules tests, the production build, and public Playwright tests pass before the migration.

## Selected Architecture

- Firebase Functions Gen 2 callable APIs own every authoritative mutation.
- Firebase Auth custom claims authorize administrators; Firestore profile roles are display mirrors.
- Public and private Firestore documents are separated because rules cannot redact individual fields from a document read.
- Gemini credentials and private instructional material remain in the Functions/Firestore trust boundary.
- Schema v3 is additive during migration; completed schema-v2 sessions remain read-only legacy history.
- MathLive, KaTeX, and CortexJS Compute Engine provide structured mathematical input and deterministic equivalence checks.

## Risks and Mitigations

- **Cutover risk:** use staging, a maintenance window, managed export, idempotent migration, and rollback instructions.
- **AI uncertainty:** deterministic checks take priority; medium confidence requests clarification and low confidence never advances a gate.
- **Duplicate operations:** require request IDs and store idempotent results.
- **Role escalation:** use custom claims, server-only role changes, audit logging, and final-admin protection.
- **Legacy data leakage:** extract hidden analyses/answers to private documents and scan the browser bundle for known secrets.
- **External configuration:** billing, secrets, App Check registration, IAM, and deployment require a Firebase project owner and are release prerequisites rather than local code changes.

## References

- `MINDGUIDE_System_Fix_and_Development_Plan.md`
- Firebase callable Functions, App Check, Firestore rules, and Emulator documentation
- MathLive, KaTeX, and CortexJS Compute Engine documentation
