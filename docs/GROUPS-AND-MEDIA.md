# Groups, invitations and mixed media

These optional portal capabilities share a service account boundary. They do
not expose the encrypted personal library or automatically collect learner
notes, progress or identity profiles. Start with [database setup](POSTGRESQL.md)
and [account configuration](COURSE-PORTAL.md).

## Group discussions and sessions

Administrators create ordinary study groups and manage their invitations,
membership and scheduled sessions. Learners read and post only in groups they
have joined. Staff may moderate ordinary groups. A member can remove their own
post; an authorized administrator can remove posts in the group they manage.
The member email list is visible only to authorized staff, not to other learners.

Sessions have a title, description, UTC start instant and duration of 1–1,440
minutes. The interface accepts/displays device-local time and identifies its time
zone. A scheduled session is a shared study plan; it creates no live call,
calendar invitation, reminder or conferencing service. Discussions are plain
text fetched on request; no real-time delivery guarantee is made.

Course, group and session edits compare expected revisions and reject stale
writes. Posts are added/removed, with no edit-history feature. Removing membership
ends access on later authorized requests; it cannot erase prior downloaded copies.
When a learner loses their last membership, published lesson bodies and files
also become unavailable. Membership in any group or teacher room grants the
deployment's shared published catalog, not a catalog private to that group.

## Teacher requests and private rooms

A verified learner can submit a subject and selected message to request a
teacher, including before joining an ordinary group. Staff can review open
requests. Only an administrator can accept an open request by creating a private
room; that administrator becomes its assigned teacher. Creating the room,
enrolling the requesting learner and assigning the request occur in one database
transaction. Competing assignment attempts are rejected.

Only the requesting learner and assigned administrator can read the private
room, its posts and sessions. Another administrator cannot inspect an assigned
room through the normal API. Private rooms cannot receive ordinary group
invitations. Staff revocation prevents the assigned administrator's subsequent
staff access; operators must handle reassignment through a reviewed lifecycle
process. A request is not a response-time or teacher-availability guarantee.

These rooms contain shared service data with database access controls, not
end-to-end encrypted personal notes. The service operator's privileged database
administration remains a separate trust boundary. General support messages are
visible to authorized support staff rather than only an assigned teacher.

## Email invitations

`createGroupInvitationHandler` in `examples/http/group-invitations.ts` is a Fetch
API handler with injected authentication, database and mailer ports. Deploy it
as `group-invitations` for the configured reference portal.

| Port | Operator implementation |
| --- | --- |
| `authenticate(request)` | Verify bearer credentials and return the trusted account UUID and current role |
| `invitations.create(actorId, groupId, email, tokenHash)` | Recheck staff/group permissions and save only the token digest |
| `invitations.revoke(actorId, groupId, id)` | Recheck authority and revoke a pending invitation |
| `sendEmail({to, subject, text, idempotencyKey})` | Deliver the prepared message through the configured mail provider |

POST accepts exactly `{groupId, email}` as JSON, with at most 1,024 body bytes.
The body-read deadline defaults to five seconds and can be reduced with
`bodyTimeoutMs`. Exact-origin CORS and verified administrator authentication are
required for browser requests. CORS does not authenticate a caller. Authentication,
database and mailer I/O need separate server timeouts and rate limits; the body
deadline does not bound the whole transaction.

The server generates 32 random bytes represented as a 64-character hexadecimal
token and stores its SHA-256 digest. An invitation lasts seven days, is bound to
the invited verified email, and can be consumed only once. It grants membership,
never an admin role. Duplicate active pending invitations for the same group and
email are rejected. Removing a member also revokes pending invitations for that
account's current email in that group.

The email contains a portal link with the token in a fragment and a copyable
code. Opening the link does not consume it; the learner must sign in with the
invited confirmed email and explicitly choose to join. The portal strips the
fragment from browser history and keeps the code only in memory. Reopen the
original invitation after account verification or refresh if needed. Email
systems still handle the invitation message; do not treat its bearer code as
public content or include it in logs.

After delivery failure, the handler attempts to revoke the pending invitation.
It reports that delivery could not be confirmed because a provider may have
accepted mail before returning an error. Staff must review pending invitations
before retrying. The supplied idempotency key is the invitation UUID; the mailer
must implement its provider's idempotency behavior. No SMTP provider, outbound
queue or delivery-status tracker is included. Follow the identity integration
distinction in [PostgreSQL setup](POSTGRESQL.md) when supplying the database port.

## Links and uploaded files

Administrators can prepare plain text, document/PDF, audio, video, image and
reference-link materials. Each published material requires content, creator
credit and rights. Accessible descriptions, transcripts and content review are
the publisher's responsibility. A media-type label does not validate an outside
link or provide transcoding/playback compatibility.

Uploaded formats are PDF, MP3, WAV, M4A, MP4, WebM, PNG and JPEG, with a maximum
of 10 MiB per file. Filename, metadata, header signature, size and SHA-256 checks
reject mismatches. Header signatures and digests do not establish that a file is
free from malicious content or that it will play on every device.

`createLibraryMediaHandler` in `examples/http/library-media.ts` is a Fetch API
handler. Deploy it as `library-media` for the reference portal, supplying:

- `portalUrl`: the trusted portal origin, HTTPS in production.
- `authenticate(request)`: verified account identity and current trusted role.
- `store`: the server-only store, such as `createPostgresMediaStore(queryPort)`.
- `scan(bytes, name)`: a real malware scanner returning `clean`, `blocked` or
  `unavailable`. Missing, unavailable or failed scanning rejects the upload.

POST accepts raw `application/octet-stream` bytes and a URI-encoded filename in
`X-File-Name`. It returns validated attachment metadata after scanning/storage.
Only administrators upload. The body-read deadline defaults to five seconds
and cannot exceed it; scanner results have a 15-second response deadline. The
scanner receives a separate bounded copy of the bytes. A response deadline does
not stop an external scanner's underlying work; bound scanner concurrency and
execution in the deployment too. Authentication and database I/O need their own
timeouts. The browser's fetch deadline is 30 seconds.

GET selects an ID using `X-Media-Id`. Authorized downloads use
`application/octet-stream`, `Content-Disposition: attachment`, `no-store` and
`nosniff`; URI-encoded metadata is returned in `X-Library-Media`. The client
verifies the returned ID, size, signature and digest before offering a download.
JSON responses are bounded at 4 MiB; this exact configured file-download route
permits up to 10 MiB.

The PostgreSQL example stores bytes in a private table, with a serialized quota
of 100 files and 100 MiB per deployment. A saved course can reference only the
complete metadata of a real stored file. A verified learner can download only a
file referenced by a published course and only while a library member. Staff can
access stored files for curation. Files are not publicly addressable by storage
URL. Database backups include these bytes and need corresponding protection.

Uploading does not publish a file: save the lesson/course before learners can
access it. Removing an attachment from a lesson does not delete the underlying
blob. The example has no file deletion or orphan cleanup API, so operators must
review retention and quota recovery before long-running use. The local demo
uses memory storage without a malware scanner and resets on refresh; it is a
UI demonstration, not a production upload service.

## Bounded workspace

| Record | Bound |
| --- | --- |
| Groups, including private rooms | 50 per deployment |
| Sessions | 100 per group |
| Discussion posts | 100 per group |
| Invitation records, including consumed/revoked records | 100 per group |
| Members | 100 per group |
| Teacher requests | 100 per learner; at most 100 per visible response |
| Title / description / discussion or teacher-request body | 160 / 2,000 / 2,000 characters |
| JSON list response | 4 MiB |
| Stored uploaded files | 100 files / 100 MiB total; 10 MiB per file |

List overflow fails rather than returning an incomplete roster or history.
Pagination, moderation policy, retention, delivery abuse controls and operational
capacity must be designed for deployments that need larger workloads. These
examples do not supply tenant isolation, guaranteed learning outcomes or a
security/compliance certification.
