# Tutor timeout diagnostics and recovery

The browser waits up to 125 seconds for a learning operation. The server route
has a 120-second deployment budget; each Gemini attempt has a 45-second timeout,
with one existing retry on HTTP 503. Operation locks last 150 seconds so that a
slow provider retry cannot expire the lock before the request budget ends.

After a transport timeout, connection failure, unreadable response, or uncertain
storage/server failure, the client checks the original operation's saved result.
It makes at most three read-only checks, each with a 10-second fetch timeout and
two seconds between checks. A completed result is returned through the normal
UI success path. Recovery does not resend the mutation or call Gemini. The
server requires an authenticated, admitted member and matches the original
validated request fingerprint in that user's operation record. If recovery
cannot confirm completion, the original error and manual reload remain available.

Server logs contain these metadata-only timing events:

- `learning_auth_timing`: authentication duration.
- `learning_storage_timing`: individual get, query, or commit duration.
- `gemini_request_timing`: duration until provider response headers, or fetch failure; `retried` identifies the second attempt.
- `learning_request_timing`: total handled route duration.

No request bodies, document paths, student responses, or credentials are logged
by these events. Hosting termination may prevent the final timing event. Compare
logs during a single session rehearsal to locate slow operations; overlapping
requests are not correlated by these events.

Before a presentation, build with `npm run build` and run the production server
with `npm run start`, or rehearse on the actual deployment. Use the existing
Firebase project and its approved learning configuration. Complete a real session
through scoring and check logs and provider quota. These changes improve recovery;
they do not guarantee provider availability or raise quota limits.
