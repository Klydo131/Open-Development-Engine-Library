# Runtime security updates

Run the same check in development, CI and the actual service environment:

```sh
node --experimental-strip-types scripts/security-runtime.ts --online --inventory
```

`pnpm security:runtime` uses the reviewed local policy without network access.
`pnpm security:updates` also checks the official Node security release index.
The direct Node command needs no dependency installation. It reads the policy
relative to the script, so the current working directory does not select a
different policy. Keep both files and `examples/http/bounded-fetch.ts` in an
operator tooling artifact if the deployed service contains only built packages.

## What the check establishes

`runtime-security.json` records supported Node majors, reviewed security minimums,
support deadlines, primary sources and a review window of at most seven days.
Unsupported versions, expired/future reviews and end-of-support lines fail.
Online mode fails on unavailable, redirected, oversized or malformed release
data, missing security-release branches, or a newer security release than the
reviewed minimum. It fetches only the fixed official HTTPS endpoint with a
ten-second deadline and a two-MiB response limit. It never renews the policy,
upgrades a runtime or deploys a change.

Inventory hashes the executable running this command and reports its version,
OS, architecture and selected bundled component versions. It excludes executable
paths, environment values, credentials and learner content. A fingerprint and
version comparison are **not vendor attestation or proof that every relevant
patch is present**. Check the distribution's signed release, published checksum,
backports and OS/container updates separately. The script cannot enumerate all
machines, embedded runtimes, containers or third-party services.

## Development and repository checks

The main CI job checks the reviewed runtime before installing the package
manager. The security-maintenance workflow checks the official Node index and
known high/critical dependency advisories daily. Relevant pull requests and
manual runs also test the policy contract on Windows, macOS and Linux with both
supported Node minimums, without installing application dependencies or browsers.
Dependabot checks npm and GitHub Actions updates daily, with at most three open
update PRs per ecosystem. Updates still require review and the full release gates.
Browser test binaries have their own vendor security advisories; an npm audit
does not establish their patch status. Keep tests on synthetic local fixtures,
review bundled browser revisions, and record unresolved vendor patch gaps.

Scheduled workflows run from the default branch; this maintenance schedule is
inactive until the workflow reaches that branch. GitHub can delay/drop queued
scheduled work and disables schedules in inactive public repositories. Review
workflow history and failure notifications; configure an independent operational
monitor for a deployed service. This workflow has read-only permissions, no
production secrets and no merge, release or deployment step.

Review the primary advisories at least weekly and promptly after a security
announcement. Verify the exact selected artifact, update related pins and the
lockfile where needed, run the tests, then advance the policy review dates with
the assessment recorded. Do not extend expiry automatically or treat a newer
ordinary release as an urgent security fix. A failed policy gate can prevent
later dependency-audit steps from running; inspect each step's result.

## Production integration

For a Node service, run the direct command with the **same executable and image**
used by the service, before promotion and after restarting/replacing it. Record
the result privately alongside source revision, deployment ID, lockfile hash and
image/vendor evidence. A CI result does not establish the running service's
patch status. If the check fails, block promotion, investigate and apply the
[maintenance process](SECURITY-MAINTENANCE.md). Do not automatically terminate an
existing service from this CLI; handle isolation and recovery through the
operator's incident process. Never roll back to a known vulnerable artifact.

A static web deployment has a build-time Node environment and browser clients;
it does not gain a running Node service merely because Node built its assets.
Assess separately any identity, database, mail, scanner or plugin service.
For another runtime, use its vendor's checks rather than claiming this Node
checker covers it. Keep inventory and administrative status out of public API
responses. Real hosted verification requires an identified deployment.

## Python, Rust and Java integrations

The current engine has no first-party Python, Rust or Java source or language
package manifest. Some npm build tools contain Rust-built native binaries;
maintain these through their actual package releases and native dependencies,
not by assuming a host compiler update rebuilds them. Learners need only a
supported browser. These languages may be used by independently operated plugins; this
Node policy does not establish their patch status or update a developer's system.

When introducing one, include its source/manifests and reproducible lockfile,
supported toolchain, least-privilege process boundary, vendor security sources,
frozen install/build, language-specific tests and dependency checks in the same
review. Add the corresponding Dependabot ecosystem only when its manifest exists.
For Python, distinguish CPython, packages and the effective TLS trust store.
For Rust, check the compiler/standard library, locked crates and native/OS
libraries and TLS roots; a compiler upgrade does not update every crate or
certificate store. For Java, match the exact distribution/build and effective
trust store to its vendor advisory. Vendor numbering and backports differ.
Do not infer coverage from an absent PATH command or install unused runtimes.

Primary references: [Node security releases](https://nodejs.org/en/blog/vulnerability),
[Node support schedule](https://github.com/nodejs/Release#release-schedule),
[Python security reporting and sources](https://www.python.org/dev/security/),
[Rust security policy](https://www.rust-lang.org/policies/security),
[RustSec advisory database](https://rustsec.org/),
[Oracle security alerts](https://www.oracle.com/security-alerts/),
[OpenJDK vulnerability group](https://openjdk.org/groups/vulnerability/),
[GitHub schedules](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).
