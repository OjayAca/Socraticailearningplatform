# Production dependency audit — 24 October 2026

Initial production audit: 18 affected dependency entries (1 critical, 9 high, 7 moderate, 1 low). Final production audit: zero advisories. Counts include propagated dependency entries, not distinct exploits.

Applied reviewed updates within existing direct dependency ranges: Next 16.3.6 → 16.4.3, Firebase 12.16.0 → 12.19.0, Firebase Admin 14.3.0 → 14.5.0, KaTeX 0.18.0 → 0.18.10, Zod 4.4.3 → 4.6.7, plus compatible transitive fixes. No force audit fix and no Firebase major downgrade.

Firebase Firestore still pins gRPC to ~1.9.0. A scoped npm override selects @grpc/grpc-js 1.14.6 only beneath @firebase/firestore. This is a reviewed same-major override outside the upstream minor constraint and must be revisited when Firebase updates that constraint. Node 22 is the tested runtime. Browser Firestore uses its browser transport; Node Firestore import and real read-only preflight are checked separately.

The gRPC advisory affects server credential authorization through getAuthContext in specific configurations. This app does not create a gRPC server or use getAuthContext; the package is used as a Firebase client. This reduces observed application exposure but is not a waiver. See [upstream advisory](https://github.com/advisories/GHSA-m9gg-hp2v-232j) and [1.14.6 release](https://github.com/grpc/grpc-node/releases/tag/@grpc%2Fgrpc-js@1.14.6).

| Package | Relationship | Initial severity | Fixed installed version(s) | Advisory / dependency chain |
|---|---|---|---|---|
| @fastify/busboy | Transitive | high | 3.2.4 | [@fastify/busboy vulnerable to Denial of Service via oversized multipart boundary](https://github.com/advisories/GHSA-xjh9-v7x6-24jw); [@fastify/busboy vulnerable to Denial of Service via prototype-named multipart part header](https://github.com/advisories/GHSA-x8mw-p69m-v3mx); [@fastify/busboy vulnerable to CRLF injection via multipart Content-Disposition filename and name](https://github.com/advisories/GHSA-gxm5-99cw-xjw9) |
| @firebase/firestore | Transitive | high | 4.17.2 | @grpc/grpc-js |
| @firebase/firestore-compat | Transitive | high | 0.4.14 | @firebase/firestore |
| @google-cloud/storage | Transitive | moderate | 8.4.0 | retry-request; teeny-request |
| @grpc/grpc-js | Transitive | high | 1.14.6 | [@grpc/grpc-js: In certain configurations, getAuthContext can return unauthorized certificates as though they were authorized](https://github.com/advisories/GHSA-m9gg-hp2v-232j); [@grpc/grpc-js: In certain configurations, getAuthContext can return unauthorized certificates as though they were authorized](https://github.com/advisories/GHSA-m9gg-hp2v-232j); [@grpc/grpc-js: The server transmits some error messages thrown by method handlers to the client in status messages](https://github.com/advisories/GHSA-f596-whhp-79r4); [@grpc/grpc-js: The server transmits some error messages thrown by method handlers to the client in status messages](https://github.com/advisories/GHSA-f596-whhp-79r4) |
| baseline-browser-mapping | Transitive | moderate | 2.11.32 | [baseline-browser-mapping process termination on invalid input causes denial of service](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) |
| brace-expansion | Transitive | high | 1.1.21, 2.1.7, 5.0.12 | [brace-expansion: Quadratic-time expansion of the `{a},b}` rewrite causes CPU denial of service](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr); [brace-expansion: DoS via uncontrolled recursion on nested brace groups causing stack exhaustion](https://github.com/advisories/GHSA-qhr7-859c-m2p7); [brace-expansion: DoS via uncontrolled recursion in parseCommaParts causing stack exhaustion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p) |
| firebase | Direct | high | 12.19.0 | @firebase/firestore; @firebase/firestore-compat |
| firebase-admin | Direct | moderate | 14.5.0 | @google-cloud/storage |
| gaxios | Transitive | moderate | 6.7.1, 7.1.3, 7.1.4, 8.3.2 | uuid |
| katex | Direct | low | 0.18.10 | [KaTeX: Existing prototype pollution can bypass trust restrictions](https://github.com/advisories/GHSA-238p-pmpm-9mq7) |
| next | Direct | critical | 16.4.3 | [Next.js: Pending `use cache` fill can leak Draft Mode content into regular responses and persisted pages](https://github.com/advisories/GHSA-3w37-wq28-93x7); [Next.js has cache poisoning of SSG and ISR pages in self-hosted applications](https://github.com/advisories/GHSA-4jqv-mc3x-m676); [Next.js has information disclosure in development server's Model Context Protocol endpoint](https://github.com/advisories/GHSA-39w2-rjm5-chcv); [Next.js has information disclosure in App Router metadata image routes via dynamicParams bypass](https://github.com/advisories/GHSA-f87g-xv8r-7p7x); [Next.js has cache poisoning in SSG/ISR rendering that leads to cross-user content substitution and persistent denial of service](https://github.com/advisories/GHSA-mcj8-r9mp-w47p); [Next.js has Server-Side Request Forgery in Image Optimization](https://github.com/advisories/GHSA-cjq9-62q9-8jv4); [Next.js: Unauthenticated Remote Code Execution in Image Optimization API when SVG files are used](https://github.com/advisories/GHSA-2464-fhr4-w9xw); [Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-p3m5-59mp-jv5r); [next.js cache leak across root param values in nested 'use cache' functions](https://github.com/advisories/GHSA-h694-7cp9-m8p3); [Next.js: Unauthenticated Remote Code Execution in `use cache` functions returning typed arrays](https://github.com/advisories/GHSA-673q-mjm6-r5xr) |
| retry-request | Transitive | moderate | 8.0.3, 9.1.0 | teeny-request |
| sharp | Transitive | high | 0.35.5 | [sharp : Vulnerability in librsvg dependency CVE-2026-96889](https://github.com/advisories/GHSA-wq5f-xc86-pv6w) |
| source-map-js | Transitive | high | 1.2.2 | [source-map-js allows event-loop denial of service through indexed source-map section offsets](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) |
| teeny-request | Transitive | moderate | 10.1.3, 11.1.1 | uuid |
| uuid | Transitive | moderate | 14.0.1, 9.0.1 | [uuid: Missing buffer bounds check in v3/v5/v6 when buf is provided](https://github.com/advisories/GHSA-w5hq-g745-h8pq) |
| zod | Direct | high | 4.6.7 | [Zod can exhaust memory while validating oversized constrained collections](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) |

## Application exposure review

- Next/sharp: framework server/image pipeline; current source has no next/image import, custom SVG optimizer, draftMode or use-cache functions. Framework availability still warrants patching, and absence of those imports is not an exploitability proof.
- Zod: directly validates untrusted learning/admin inputs and provider outputs; high relevance. Existing request schemas and limits remain enabled.
- KaTeX: renders learner math. Trust restrictions remain enabled; prototype-pollution prerequisite was not reproduced. Patched anyway.
- Firebase client/compat/gRPC: Node transport path; web browser transport does not run a gRPC server. Reviewed and scoped override applied.
- Firebase Admin/Google Cloud Storage/gaxios/retry-request/teeny-request/uuid: server SDK transitive tree. No application use of caller-supplied uuid output buffers was found; update upstream SDK tree instead of imposing a uuid major override.
- busboy: transitive multipart parser; learning API accepts JSON, with no application multipart upload route. Patched within dependency resolution.
- brace-expansion/source-map-js/baseline-browser-mapping: tooling/transitive paths; no application endpoint directly consumes untrusted patterns or source-map offsets. Patched.

## Evidence and limits

Raw production audit snapshots: release-evidence-2026-10-24/audit-before.json and audit-final.json. package-lock.json is the exact resolved tree. package.json contains the scoped override. See remediation report for actual regression, bundle scan and live read results.

The installation summary includes development dependencies and still reported 30 advisories (14 moderate, 13 high, 3 critical); this is distinct from the zero-advisory production audit. Development-tool hardening remains an operator concern: keep development servers local and do not treat npm audit --omit=dev as an all-dependencies security certificate. No blanket risk acceptance is implied.

No unresolved production advisory remains in the final snapshot. Required remaining decision is deployed acceptance and upstream-removal timing for the scoped gRPC override. A successful build alone is not security acceptance.
