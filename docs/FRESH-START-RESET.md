# Fresh-start reset — 2026-10-16

Executed the user-approved reset against the existing `socratic-ai-a7765` Firebase project using `scripts/reset-learning-data.ts`.

- Private before-image backup and explicit deletion manifest: `.local-backups/fresh-start-1792157458569.json` (ignored by Git).
- Backup covered 199 Firestore documents; 164 learning/obsolete documents were deleted, including all 43 sessions and their descendants.
- All six Firebase Authentication accounts and profiles retained. Profile statistics reset; historical activity fields cleared.
- Validated catalog retained: two subjects, twelve topics and exact nested subtopics. Archived temporary catalog removed.
- Policies, consent records, pilot admission, audit logs, system configuration, actual AI usage and rate limits verified unchanged.
- Learning writes were frozen, the local server stopped, and active leases checked before deletion. Original pilot settings restored after checks.
- Independent `verify` run passed after restoration. Server restarted on `http://localhost:5173`.
- Authenticated browser dashboard confirmed 0 completed sessions, no average/latest scorecard, 0-day streak, and no learning records.

Operator commands: `node --import tsx scripts/reset-learning-data.ts prepare`, then `apply --manifest=<exact backup path>` while the server is stopped, followed by `verify --manifest=<same path>`. Prepare creates a new private backup and freezes learning writes. Apply refuses unexpired AI leases, unexpected post-backup learning changes, or altered authentication accounts. It can resume partial deletions from the same manifest. Unknown root collections fail closed for explicit classification. No sample content is created.
