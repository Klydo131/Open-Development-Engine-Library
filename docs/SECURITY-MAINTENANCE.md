# Security maintenance

Security controls and patched software serve different purposes. Request bounds
reduce accepted work; they do not repair a vulnerable runtime or native library.
Use the [layer guide](SECURITY-LAYERS.md) to identify where each control runs.

## Keep an artifact inventory

For each deployed service, record its source revision, deployment/build ID,
runtime distribution, OS/container image digest, package manager, lockfile hash,
direct/transitive dependencies and externally operated identity, database, mail
and scanner services. Include native libraries bundled into the runtime and
build tools that can execute during installation or CI. The static web build and
the hosted service can have different runtime exposure.

The repository declares its Node version in `.node-version`, its package manager
in `package.json`, and dependencies in `pnpm-lock.yaml`. Inspect the actual
deployment as well: those files cannot prove which binary a host started.
Vendor backports can fix an issue without changing a bundled library's displayed
version. Verify the vendor release/advisory and exact artifact rather than
accepting or rejecting a fix from a version string alone.

## Review an advisory in small, verifiable steps

1. Read the original vendor advisory, release notes and relevant change or patch.
   Preserve the URL, publication/update dates, affected range and fixed artifact.
   Revisit updated advisories; an initial announcement may gain new conditions,
   platform rebuilds or follow-up fixes.
2. Map exposure to this deployment: browser, public backend, database, build/CI,
   optional adapter or an unused component. Check the vulnerable operation and
   configuration, not merely whether a package name appears in the lockfile.
   Unknown reachability remains unknown until investigated.
3. Prioritize reachable code execution, authorization/data-loss risks and
   reported exploitation. If a fix cannot be applied, record an official
   temporary mitigation or reduce exposure. Assign an owner and review date.
   A WAF rule or application validator is not proof of remediation.
4. Change the smallest related dependency/runtime set. Read migration notes and
   the lockfile diff, including transitive changes and install-script policy.
   Use the pinned manager and a frozen, script-disabled install. Do not apply
   forced audit fixes or blanket-approve package scripts.
5. Add a synthetic regression or abuse case for the actual failure where
   practical. Observe it failing against the affected behavior, then passing
   after the fix. Run affected checks and the required CI gates for the final
   revision; include runtime/package-consumer tests when those boundaries change.
6. Rehearse the actual deployment in staging, including the updated artifact,
   scanner/database integrations and failure paths. Record approval separately
   from the existence of a green PR. Check that rollback will not restore a
   known vulnerable artifact; prepare isolation or roll-forward recovery too.
7. After deployment, verify the running artifact and relevant behavior, then
   record the result and next review. A source merge or successful build alone
   does not patch an already running process.

Registry audit results cover known advisories, not malicious packages, every
runtime dependency or every configuration. Review provenance, ownership,
release source and new script execution alongside audit output. Node publishes
[security releases](https://nodejs.org/en/blog/vulnerability); each dependency
and hosting provider needs its own primary advisory/release channel.

## Keep CI permissions and patch evidence narrow

The current workflow uses a read-only token, action commit pins, frozen installs,
disabled dependency lifecycle scripts, bounded workers and job timeouts. It does
not deploy or merge. Preserve those properties when updating tooling. Do not
run untrusted PR code with deployment secrets or elevated repository credentials.
Review action changes and their dependencies as executable code, not just YAML.
GitHub's [secure-use reference](https://docs.github.com/en/actions/reference/security/secure-use)
describes least privilege, action pinning and workflow dependency lockfiles.
Evaluate newer locking mechanisms against the supported runner/toolchain before
adopting them; do not claim they are enabled by the existing SHA pins.

Keep one short record per assessed update:

```text
Assessed on / owner:
Component and deployment/artifact:
Advisory and release-note URLs / last checked:
Affected operation and reachable configuration:
Decision: patch / not affected / temporary mitigation / unresolved
Evidence for that decision:
Old artifact -> selected artifact / source revision:
Changed dependencies and approved script policy:
Regression, build, integration and CI results:
Staging/deployment verification and recovery plan:
Remaining uncertainty / review date:
```

Keep exploit details, credentials and real user data out of public issues and
logs. Use the [security reporting policy](../SECURITY.md) for private findings.
User-visible release notes should explain the benefit or required user action;
operational evidence belongs in the appropriate engineering record. Never claim
universal safety, a complete audit or remediation from a passing dependency
audit alone.
