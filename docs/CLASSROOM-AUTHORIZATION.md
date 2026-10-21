# Optional classroom authorization reference

Status: executable reference policy, 2026-10-18. No hosted accounts, database adapter, or classroom service is deployed by this module. The browser's private library remains separate from classroom authority.

The web app's [local brief/submission/feedback workflow](EDUCATION.md) uses
explicit selected-file exchange. It does not call this policy or the abuse guard
to establish school roles, sharing permissions or network protection. File
recipient labels and imported feedback remain unverified.

Why this exists: sharing selected work should not expose another learner's work, a different course, or personal journals. `packages/education/src/authorization.ts` provides one small, default-deny decision function for a future trusted server adapter. Imported files and the local demonstration cannot create identities, enrollments, or teacher privileges.

## What the policy allows

| Resource | Active learner | Active teacher |
| --- | --- | --- |
| Course brief | Read, export, download in their course | Read, export, download in their course |
| Selected submission | Read, export, download their own work | Read, export, download and create feedback only when assigned to that learner in that course |
| Feedback | Read, export, download feedback for their own work | Read, export, download only when assigned to that learner |
| Personal journal | Denied through classroom APIs | Denied through classroom APIs |

There is no administrator bypass. Feedback is created against a submission, never against another feedback record. No delete, roster management, grading, attachment upload, or enrollment creation permission is implied. Unknown actions are denied. Tenant suspension, course archival, a revoked resource, an inactive actor, or revoked/missing membership denies access. Teacher access also requires the learner to retain active membership. Reassignment and revocation take effect on the next trusted decision.

## Adapter contract

1. Authenticate the caller on the server. Derive `actorId` from the verified session, never a request body, URL actor parameter, or imported JSON. This function deliberately does not authenticate a person.
2. Construct an exact request `{actorId, resourceId, action}`. Extra role or tenant claims are rejected. IDs are bounded opaque identifiers, never filenames or paths.
3. Provide `EducationAuthorizationRepository` backed by server-owned actor, resource, course, membership, and assignment records. Every lookup must refer to the same authoritative state. Map database values explicitly to the documented types; do not accept imported role labels or client-provided repository results.
4. Call `assertEducationAccess(repository, request)` inside the transaction/snapshot that executes the protected query or mutation. A grant is an immediate decision, not a token to cache or present later. A sequence of unrelated database requests does not prevent revocation races. Use serializable transactions, suitable locks, or equivalent database-enforced predicates so assignment/membership checks and feedback creation cannot race. Mere transaction wrapping at a weak isolation level may not suffice.
5. For downloads, look up the attachment by its trusted parent resource and authorize that parent before returning bytes. Do not accept an arbitrary storage key from the client. This policy does not model attachments, sign URLs, sanitize files, or protect independently public storage. Private storage and parent-to-object ownership checks are mandatory. Long-lived signed URLs can outlive revoked access; prefer an authorized streaming endpoint or short-lived links with an explicit revocation strategy.
6. Apply the same permission check to previews, exports, search results, nested feedback routes, and download paths. An export does not authorize an unrestricted course dump. Return only the selected resource and any independently authorized children. Strip internal records and secrets from output.
7. Convert denial into a consistent HTTP response that does not reveal whether a resource exists. Repository errors must fail the request; never fall back to an allow result. Bound requests, rate-limit endpoints, validate feedback bodies, and avoid logging learner text or private identifiers unnecessarily.

The returned frozen snapshot includes only relevant IDs, role, action, and resource kind. It cannot prove authorization remained valid after the call. It is not suitable for a browser trust boundary, a bearer capability, or an offline role certificate.

## Release acceptance before any hosted classroom

- Supply verified identity, private storage, authoritative enrollment/assignment administration and transactional enforcement. Test actual backend/database policies, not just these synthetic TypeScript fixtures.
- Prove learner A cannot read learner B through read, preview, export, search, or file routes. Prove another course/tenant's teacher and an unassigned teacher cannot access learner work.
- Exercise concurrent withdrawal/reassignment and feedback creation, download, and export. State the retention and revocation behavior; test that links and caches follow it.
- Keep journal records outside classroom queries and permission joins. Shared work must come from a deliberate selected submission, never a whole-vault export or a student passphrase.
- Establish institution-specific consent/lawful processing, child safeguarding, retention/deletion, accessibility, incident response, backup restoration and deployment-specific legal review.

Unit tests cover the decision matrix, malformed claims, resource identity consistency, missing/revoked membership, disabled actors, suspended tenants, archived courses, and storage-facing download/export actions. These are reference-policy tests, not a live backend audit, independent penetration test, security certification, or legal approval. No fresh Codex Security scan is claimed.

Next action: implement one trusted server adapter and test database isolation and private-file ownership before enabling any hosted classroom feature. Review this boundary whenever roles, routes, resource kinds, or storage providers change.

## Bounded abuse guard

`packages/education/src/abuse-guard.ts` adds `runGuardedEducationOperation(store, {actorKey, byteLength}, operation)`. The store must atomically acquire both actor and global request budgets and concurrency slots before work begins. The wrapper releases concurrency in `finally`; failed work still consumes its request budget. An unavailable store fails the request. Denials provide a reason and `retryAfterMs`; an HTTP adapter can round this up to seconds for `Retry-After`. Payload/invalid-request rejection is not a retry promise.

The `MemoryEducationAbuseGuard` reference uses configurable fixed windows, payload size ceilings, per-actor/global concurrency limits, and a bounded key registry. It removes only idle, expired keys; a full registry rejects new keys instead of allocating unbounded memory. Its injectable monotonic clock rejects rollback. It exposes only a key count for diagnostics. Cleanup scans at most `maxKeys` entries, so choose a deliberately modest bound and benchmark the actual workload. Fixed windows permit bursts across a window boundary; this is a simple budget, not a precise sliding-window guarantee.

The server must derive `actorKey` from a verified principal and measure/bound bytes while reading the request. Do not trust claimed content length, raw unverified IP headers, client roles, or arbitrary user-supplied keys. Reject a stream exceeding the limit before buffering/parsing it. Authentication and network limits must run before this authenticated operation guard; apply resource authorization too. Authorization and abuse limits solve different problems.

This memory implementation is single-process and resets on restart. It is **not deployed bot protection or DDoS protection**. Multiple server instances require a shared atomic store with matching expiry, lease recovery, global-budget, and fail-closed behavior. Enforce operation deadlines/cancellation and bounded parsing/importing so hung work cannot hold permits forever. Use gateway body/rate/concurrency limits and the hosting provider's network protections before requests reach application workers. No CAPTCHA or live firewall setting is configured here.

Hosted acceptance must demonstrate consistent limits under concurrent multi-instance requests, rejected request streams, identity/key churn, upstream authentication floods, store outages, worker crashes/expired leases, and deadline cancellation. Tests here cover burst/global budgets, concurrency, exception release, clock rollback, payload errors and bounded key churn only. No claim of predicting attacks years ahead or defeating every bot is made.

The design is informed by [OWASP ASVS 5.0.0, validation and business logic](https://github.com/OWASP/ASVS/blob/v5.0.0/5.0/en/0x11-V2-Validation-and-Business-Logic.md), including anti-automation controls for costly functions. This is a design reference; these fixtures do not verify every ASVS requirement or establish a verification level.
