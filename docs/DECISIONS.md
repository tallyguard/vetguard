# Decision log

Append-only. One entry per decision that would otherwise be re-litigated.
Format: date, decision, reason, alternatives rejected.

## 2026-07-22: Corpus refresh automation

`refresh-corpus.yml` regenerates the bundled npm-high-impact corpus monthly (and
on demand). When the corpus content changes (a name change or a source-version
bump, not just the restamped `generatedAt` timestamp), it pushes a branch and
prints a compare link; a maintainer opens the PR from that link, which runs the
full gate (including the accuracy eval) before merge. It never direct-pushes to
main. The workflow deliberately does NOT call `gh pr create`: a PR opened by the
built-in `GITHUB_TOKEN` does not trigger workflow runs (GitHub's anti-recursion
rule), so an auto-opened PR would sit unmergeable with its required `gate` checks
never running; a human-opened compare-link PR is actor-attributed to the
maintainer and runs CI. Rejected: `gh pr create` with the built-in token
(CI-less, unmergeable PR); enabling the org "Actions may create PRs" setting
(does not fix the no-CI problem, and the org disallows it anyway); a stored PAT
(a long-lived credential, against the OIDC-only stance); a GitHub App
installation token (viable for fully-automated PRs later, but overkill for a
monthly maintainer click); direct-push to main (skips review and the accuracy
gate).

## 2026-07-21: Known-CVE detection via OSV.dev

The `known-cve` detector answers "does this resolved version have a known
advisory?" against OSV.dev (`src/ecosystems/npm/osv.ts`). It is table stakes:
without it a developer still needs `npm audit`.

- Collection is a batched pass: POST `/v1/querybatch` returns advisory ids per
  `name@version` (chunked at 1000), then GET `/v1/vulns/{id}` fetches each detail
  once. Two in-run caches (name@version and id); the detail fan-out is bounded at
  concurrency 8 across the whole batch, not per package. Only registry-sourced
  facts with an exact resolved version are queried.
- Honest degradation is the spine. `knownVulnerabilities` is `undefined` (not
  checked), `[]` (checked clean), or non-empty. Offline, any batch or parse
  failure, a null or non-array result entry, a hit with no usable id, and a
  registry package with no exact version (a range, or a manifest-only scan) all
  mark the package unverified, so the verdict degrades to could-not-verify. A
  scan that checked zero advisories never reads clean. `--offline` disables OSV.
- Severity maps by `resolveAdvisorySeverity` (`src/ecosystems/npm/cvss.ts`): take
  the higher of the GHSA qualitative label (`database_specific.severity`) and a
  hand-rolled CVSS v3.0/v3.1 base-score band, so a low label cannot mask a higher
  CVSS; clamp a matched advisory to at least `low` (a known vuln must trip
  `--fail-on low`, never `info`); floor to medium when neither a label nor a
  parseable CVSS_V3 vector is present.
- Untrusted input: OSV data is treated as hostile. The advisory id is
  shape-validated (`/^[A-Za-z0-9._-]{1,128}$/`) before it reaches a raw terminal
  render or the deterministic URL; summaries are control-stripped and truncated;
  the detail GET path segment is `encodeURIComponent`d; the severity resolver is
  total (never throws on a malformed shape).

Rejected: a CVSS npm dependency (would refute near-zero-deps; the parser is
hand-rolled); computing CVSS_V4 scores (materially more complex and near-empty
for npm/GHSA, so floored to medium with the vector quoted); guessing severity
high or low on missing data (guessing high burns the FP budget, guessing low
leans toward a false-safe). Accepted limits, each a follow-up: the OSV response
body is parsed unbounded like the registry/downloads clients; at most 25
advisories per package are itemized; `querybatch` pagination is not consumed
(single-version lookups do not paginate); ignore and baseline suppress a
package's advisories as a group, not per-CVE.

## 2026-07-21: esbuild pinned via overrides to clear a dev-server advisory

The toolchain (tsup, tsx, and vite via vitest) pulls esbuild. vite@8 requires
esbuild `^0.27.0`, which lands in the range of GHSA-g7r4-m6w7-qqqr (arbitrary
file read via the esbuild dev server on Windows; low severity). vetguard never
runs the esbuild dev server and ships zero runtime dependencies, so the advisory
cannot affect the published package or its users, but an open alert on a security
tool is not acceptable. A `package.json` `overrides` forcing `esbuild` to
`^0.28.0` (the patched line tsx already uses) applies across the tree; the full
gate stays green and `npm audit` reports zero vulnerabilities. Keep the override
until vite's esbuild range moves past the advisory. Rejected: `npm audit fix
--force` (a breaking toolchain major bump for a non-applicable low advisory);
dismissing the alert as not-used (accurate, but the override is a real fix with
no downside here).

## 2026-07-21: Name detectors are offline-capable via a threaded unverified reason

Offline (and in the CI dogfood, which runs `scan . --offline`), the registry is
never consulted, so `existsOnRegistry` is undefined and the name detectors used
to produce nothing, which left the self-scan unable to catch an introduced
typosquat or slopsquat with no network. The collector now threads why existence
is unknown into `PackageFacts.existenceUnverifiedReason` (`offline` when the
registry was deliberately skipped, `error` on a lookup failure). `typosquat` and
`hallucination-name` fire on a corpus near-miss or recombination when the reason
is `offline`, at severity `low` and confidence `low`: offline there are no
existence or adoption facts to corroborate, and the typosquat confident-transform
bump is not applied. `low` keeps `--fail-on medium|high` consumers unaffected
while still exiting non-zero under the default no-threshold gate the dogfood
relies on. On a transient online `error` the detectors stay silent, so a
rate-limited lookup on a resembling name is never a false positive. Corpus
self-membership is checked first, so established packages (all of vetguard's own
deps) are suppressed; adding a future non-corpus dependency whose name resembles
a top-ranked corpus name will fire `low` and turn the offline dogfood red, which
is intended and cleared with a `vetguard.config.json` `ignore` carrying a reason.
Rejected: firing on every unknown-existence lookup (a transient failure on a
resembling name would false-fail the default gate); a `non-critical` severity
(would trip `--fail-on medium`).

## 2026-07-21: diff keys on resolved identity, not just name@version

`introducedFacts` in `src/core/diff.ts` keys each dependency on
`name@version#origin`, where `origin = integrity ?? resolvedUrl ?? source`. The
resolved-origin suffix is load-bearing: a same-version lockfile repoint (the
poisoning vector) keeps `name@version` but swaps `integrity`/`resolvedUrl`, so a
plain `name@version` key would treat the repoint as unchanged and the diff would
report nothing introduced. Keying on the resolved identity is what makes that
repoint visible as an introduced fact; a future refactor must not drop the origin
suffix. Rejected: keying on `name@version` alone (the M1.2 diff-mode review
showed it is blind to a same-version repoint, a HIGH-severity gap).

## 2026-07-21: Name finalized to "vetguard" (supersedes "vetdep")

Package/CLI name: `vetguard` (vet + guard; available on npm 2026-07-21;
security-forward, easy to say and spell, echoes the GuardDog lineage without
copying it). This supersedes the placeholder `vetdep` used during Phase 0
scaffolding. Rejected finalists (all npm-free): `provenir` (French "to
originate" = provenance; distinctive but pronunciation not obvious),
`depproof` (clear but utilitarian), `provenote`. Deliberately-misspelled
coinages (`veriphy`, `integritee`) were ruled out on principle: a tool that
fights typosquatting should not itself ship under a lookalike-swap name.
Repo will be created public (see next entry). The repo directory name
("npm-package-vulenrability-detector", a typo) is unrelated to the package
name and left as-is.

## 2026-07-21: Only the owner merges; others require review

`main` branch protection tightened so contributions from anyone other than the
owner are gated: a pull request now requires one approving review, and pushing
to `main` (which includes merging a PR) is restricted to the owner account.
CI-must-pass, linear history, and no force-push/deletion stay. `enforce_admins`
remains false: a solo owner cannot approve their own PR, so the owner keeps an
admin bypass to merge, while every non-owner is forced through review and
cannot merge. Net effect: external and future-collaborator PRs need the owner's
review and can only be landed by the owner; the owner (and the owner's
delegated automation) can still merge. Rejected: `enforce_admins` true (would
deadlock a solo maintainer, no one can approve the owner's own PRs).

## 2026-07-21: Publish via npm trusted publishing (OIDC), not a token

The release workflow publishes with npm trusted publishing (OIDC): no
long-lived npm token, credentials minted per-run from GitHub's id-token, and
automatic provenance. Reason: npm is deprecating token-bypass-2FA publishing
(config lock ~Aug 2026, direct-publish removal ~Jan 2027), and OIDC is the
recommended, more secure replacement. Consequences baked into the setup:
release.yml uses Node 24 + `npm install -g npm@latest` (OIDC needs npm >=
11.5.1; Node 22 ships npm 10.9.x), drops NODE_AUTH_TOKEN, and drops
`--provenance` (automatic under OIDC). `publishConfig.provenance` was removed so
a local bootstrap publish does not fail trying to attest off-CI. Known
limitation (npm/cli#8544): trusted publishing cannot be configured for a
package that does not exist, so the first publish is a one-time local bootstrap;
see docs/RELEASING.md. Rejected: granular access token in a repo secret (what
npm is deprecating; a stored secret to leak/rotate).

## 2026-07-21: Repository moved to the tallyguard org

The repo moved from a personal account to github.com/tallyguard/vetguard. The
npm account that will own the package is connected to the tallyguard org, and
publishing from a repo under that org is what lets npm provenance attribute the
package to its real source. All repository/homepage/bugs/action/SARIF
references were updated, the remote repointed, history pushed, and branch
protection re-applied (same policy). Branch protection contexts, secrets
(NPM_TOKEN), and the release are set up on the new repo.

## 2026-07-21: scan reads the lockfile tree; CI dogfood is offline

`scan` prefers the resolved package-lock.json (v2/v3) tree over the manifest,
so it covers transitive dependencies and exact versions (which lets
unpublished-version fire at scan time). Unsupported lockfiles (v1, yarn, pnpm)
fall back to the manifest with a warning, never a silent skip. Because a
full-tree online scan makes hundreds of registry/downloads calls and its result
depends on third-party dependency state and API rate limits, the CI dogfood
step runs `--offline` for determinism; the offline dogfood unit test remains the
"stays clean" guarantee. A live full-tree smoke test is deferred until a
cross-run cache and gentler rate limiting exist.

## 2026-07-21: install-scripts uses age as an establishment proxy

When the downloads API rate-limits during a large scan, adoption is unknown; an
old package (> 365 days) with an install script is then treated as established
and suppressed rather than flagged on missing data. Age only applies when
downloads are unknown; a known-low download count still stands. This keeps a
years-old native-build package like fsevents from false-positiving under load.

## 2026-07-21: Popular-package corpus source

The bundled corpus for name-similarity detection is npm-high-impact (wooorm,
MIT), download-ranked, regenerated by `scripts/refresh-popular.mjs` (dev-only,
Node built-in fetch, no runtime dependency) into
`src/ecosystems/npm/data/popular-packages.ts` (a generated module, so the
detector stays a pure import with no resolveJsonModule config). The array index
is the popularity rank, which the typosquat detector uses to tier its verdict.
Attribution: npm-high-impact (MIT), upstream data ecosyste.ms (CC-BY-SA-4.0);
bare factual name lists are not themselves copyrightable. Rejected:
all-the-package-names (2.8M unranked names, a false-positive catastrophe for a
distance detector) and libraries.io (API key, rate limits, paid bulk access).

## 2026-07-21: Git workflow and branch protection

Trunk-based with short-lived branches and PRs. `main` is always green and
releasable; the only direct commit to `main` was the initial import.
Every change lands on a `type/slug` branch (`feat/`, `fix/`, `docs/`,
`chore/`, `refactor/`, `test/`) and merges via PR using **squash merge**
(one commit per feature on `main`). Commit messages: imperative, one or two
lines, no emojis, no authorship trailers. `main` branch protection requires
both CI checks (`gate (20)`, `gate (22)`) green and a PR (0 approvals, so the
solo maintainer can self-merge), enforces linear history, and blocks
force-push and deletion; `enforce_admins=false` so the owner is never locked
out. Rejected: committing to `main` directly (loses the CI gate and review
point); requiring approvals (would block a solo maintainer).

## 2026-07-21: Repo will be public

The GitHub repo is public from creation. Reasons: it is an open-source gift;
the value proposition (no account, no server, auditable) requires the source
to be readable; a security tool earns trust by being inspectable; public
unlocks free CI, GitHub code scanning, community rule contributions, and npm
provenance signing. Rejected: private/stealth start (nothing to hide, no
secret sauce, and privacy would contradict the pitch).

## 2026-07-21: Name "vetdep" and Apache-2.0 license (SUPERSEDED)

Original placeholder decision. License Apache-2.0 still stands. Name `vetdep`
was superseded by `vetguard` (see entry above). Kept for history.

## 2026-07-21: Positioning - AI-specific supply-chain threats

The product leads with detecting AI-era attacks (hallucinated/slopsquatted
dependencies, typosquats, malicious young packages, prompt injection aimed at
coding agents), with known-CVE lookup included as table stakes. Reason: the
general scanner market is crowded (Socket, Snyk, GuardDog); the AI-specific
niche is thinly served and matches the project's motivation (see
PRIOR-ART.md). Rejected: general-purpose scanner competing head-on with
Socket/GuardDog; SAST on first-party code as a core bet.

## 2026-07-21: Open source, free, local-first

The tool is a free open-source gift: no account, no server, no telemetry,
fully local except the registry/advisory lookups a scan needs (and
`--offline` disables those). Rejected: commercial/SaaS ambitions shaping the
architecture. License choice still open (Apache-2.0 recommended).

## 2026-07-21: Ecosystem-agnostic core, npm adapter first

The core engine (facts model, rule engine, reporting) is ecosystem-neutral;
npm is the first adapter, PyPI the planned second. npm first because it is
the largest AI-hallucination surface. Rejected: npm-only hardcoding
(re-architecting later costs more); multi-ecosystem at launch (spreads the
MVP thin).

## 2026-07-21: Docs-as-memory layout

Adopted the CLAUDE.md + INDEX/PROJECT-STATE/DECISIONS structure (modelled on
the popiadesk repo) so any AI session can recover project context from files
instead of re-deriving it. Rejected: a single monolithic CLAUDE.md holding
everything (goes stale and bloats the context loaded every session).
