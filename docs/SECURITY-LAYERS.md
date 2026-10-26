# Security layers for a deployment

Use this guide with the [security policy](../SECURITY.md) and
[maintenance procedure](SECURITY-MAINTENANCE.md). The repository supplies
contracts, reference services and regression checks. Operators must configure
and verify the surrounding platform. A passing local test is not evidence that
a deployed identity provider, database, scanner or gateway is configured safely.

## Separate the applications and their trust boundaries

The personal room stores passphrase-encrypted snapshots. Its running browser
can read unlocked content; a compromised device or changed same-origin build
can defeat that boundary. Email account recovery cannot unlock this vault.

The institutional portal is a separate shared service. Courses, support,
discussions, teacher rooms and uploaded files are readable by the service and
their authorized participants. They are not end-to-end encrypted vault data.
The default portal is a temporary in-memory demonstration. The PostgreSQL
reference schema represents one operator's shared catalog, not isolation
between unrelated institutions.

| Layer | Repository control | Deployment responsibility |
| --- | --- | --- |
| Runtime and build | Pinned Node/package-manager versions, frozen lockfile, disabled dependency lifecycle scripts, action commit pins and read-only CI token | Patch the actual OS/runtime/container and bundled native libraries; verify the deployed artifact, not only a manifest version |
| Edge and HTTP server | Fetch handlers reject unsupported requests and foreign origins | TLS, DDoS protection, trusted proxy configuration, header/request/socket deadlines, decoded-body limits, connections, fleet-wide abuse and spending controls |
| Identity and permissions | Injected verified authentication; PostgreSQL account, role, membership and resource checks; revision-aware mutations | Configure signature/issuer/audience/expiry verification, account confirmation, staff grants/revocation, session policy and protected database credentials |
| Application work | Bounded validators, request/response byte limits, deadlines, upload admission and scanner checks | Bound authentication, database pools/queries, mail delivery, downloads and external workers; size limits do not bound aggregate traffic |
| Storage and privacy | Authenticated vault envelopes; private media store; narrow server roles and ownership/membership checks | Database privileges, backups, encryption/key operations, retention, deletion/handover, restore drills and region policy |
| Delivery and response | Unit/SQL/browser checks, dependency audit, package-consumer checks and bundle budgets | Review every change, rehearse a deployment, monitor failures without private content, rotate exposed credentials and maintain a response procedure |

An attacker can cross several layers before application code executes. Apply
server and platform limits there too. Node's guidance specifically covers
[reverse proxies, HTTP timeouts and resource exhaustion](https://nodejs.org/en/learn/getting-started/security-best-practices).
[OWASP API4](https://api-security.owasp.org/editions/2023/en/0xa4-unrestricted-resource-consumption/)
also treats concurrent work and paid external operations as resource risks.

## Bounded uploads and scanner work

Create one media handler per long-lived worker or application instance and reuse
it for requests. For example, after supplying real server-side adapters:

```ts
import {createLibraryMediaHandler} from './examples/http/library-media.ts';

const mediaHandler = createLibraryMediaHandler({
  portalUrl: 'https://library.example',
  authenticate,
  store,
  scan,
  maxConcurrentUploads: 2,
  scanTimeoutMs: 15000,
});
```

`maxConcurrentUploads` defaults to 2 and accepts integers from 1 through 16.
An admitted upload occupies capacity while its body, scanner and storage work
are pending. Admission follows verified administrator identity and cheap request
checks, but precedes body consumption. A full handler rejects another upload
with HTTP 503 and `Retry-After: 1`, without queuing it or reading its body.
This response retains `no-store` and `nosniff` protection.

`scanTimeoutMs` defaults to 15,000 and accepts integers from 1 through 15,000.
A deadline ends the wait for a scan result; it cannot terminate arbitrary scanner
code. A timed-out scan keeps its admission slot until its actual promise settles.
The slot is released only when both the handler and that scanner task have
settled. Late clean results do not authorize storage. Elapsed-time checks also
reject a result arriving beyond the deadline when delayed timers could otherwise
miss it. Synchronous code that blocks JavaScript still cannot be interrupted.

The scanner receives a separate bounded byte copy. This protects the bytes being
stored from scanner mutation; it is not a peak-memory guarantee. Allocation,
decoding, storage copies and scanner internals add memory. Run untrusted or
expensive parsing/scanning in a separately constrained worker or service that
can actually be stopped. Never substitute an always-clean function for a scanner.
File signatures and hashes establish format/integrity, not malware safety;
see [OWASP file-upload controls](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html).

This counter is per handler instance. Recreating the handler per request defeats
it; independent processes and serverless instances have independent capacity.
Use shared gateway quotas and a bounded external worker pool to limit the fleet.
Authentication and GET downloads are outside this upload counter. Permanently
stalled scans consume capacity until they settle or the affected worker is
recovered. That deliberate refusal protects the worker from unlimited detached
work; operators still need scanner health monitoring and a recovery procedure.

`Retry-After` is guidance, not a client retry policy. Do not automatically repeat
an ambiguous mutation: another timeout may occur after storage or mail delivery.
The [transport guide](HTTP-TRANSPORT.md) explains this distinction.

## Verify before admitting real users

Use a disposable environment and synthetic accounts/content. Check that revoked
and changed roles cannot retain access, cross-user requests fail, malformed and
oversized input is rejected, and concurrent uploads reach the configured bound.
Exercise blocked, failed, slow and permanently stalled scanners; verify overload
responses, recovery after settlement and absence of late storage writes.

Test the deployed authentication callbacks, SQL grants/policies, mail delivery,
scanner isolation, gateway limits, backup restore and retention process. Confirm
the headers on real deployed responses. Keep logs to operational outcomes and
redacted identifiers; do not log tokens, invitation links, filenames, library
plaintext or uploaded bytes. Permission removal cannot retract copies already
received. Record remaining gaps instead of treating an example or test suite as
a security or regulatory certification.
