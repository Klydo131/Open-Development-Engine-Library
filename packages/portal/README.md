# Optional course portal

Provider-neutral contracts and strict, detached, immutable record validation for a course catalog, email account adapter and learner support. The generic package has no runtime dependencies, React, network calls, storage or account implementation. It carries no private library, journal or encryption passphrase. Public course previews can have empty lesson arrays; publishing must require actual material in the provider.

Limits: 100 courses per response, 50 lessons and 256 KiB per course, 20,000 characters per lesson, 100 support threads per response and 5,000 characters per support message/reply. Responses are capped at 4 MiB. Pagination is required before a deployment exceeds these bounds. Text is plain text; links allow HTTP(S) without credentials. Render as text, not HTML. Link checks are syntax checks, not content safety endorsements.

The runnable local demo has simulated identities. The optional Supabase example implements this contract with verified Auth calls, private server-owned administrator roles, database row policies and transactional revision checks. Hosted email delivery, abuse defenses, retention, moderation and child-facing legal arrangements still require operator setup and testing. Never use an account password as a private-room encryption key.
