# Project state

The live cache. Current facts only; if a change makes a line here wrong,
fixing it is part of that change. Dates are absolute (YYYY-MM-DD).

Last verified: 2026-07-22

## What this is

A free, open-source, local-first scanner for AI-era npm supply-chain
threats: hallucinated (slopsquatted) dependencies, typosquats, malicious
young packages, prompt injection aimed at coding agents, plus known-CVE
lookup. CLI (`scan` / `check` / `diff` / `baseline`) + GitHub Action. Ecosystem-agnostic
core, npm adapter first. Full plan: PLAN.md. Decisions: DECISIONS.md.

## Status

- 2026-07-21: **Phase 0 complete.** Named `vetguard`, Apache-2.0, public repo
  (github.com/tallyguard/vetguard, `main` protected). Toolchain, core model +
  engine, npm manifest reader, `nonexistent-package` detector, terminal
  output, CLI, CI, and open-source governance shipped and pushed.
- 2026-07-21: **Phase 1 in progress.** Registry client, registry enrichment
  collector, and `check <pkg>` landed (PR #1). `nonexistent-package` fires on
  real lookups. Dogfood self-scan test + scan orchestration extracted (PR #2).
  Downloads collector (npm downloads API), package-age (`ageDays`) and
  `versionCount` facts, and the `young-package` detector landed (PR #3).
  Detectors live: `nonexistent-package`, `young-package`, `install-scripts`
  (install lifecycle scripts correlated with risk facts; established popular
  packages like esbuild are suppressed, verified live), `unpublished-version`
  (pinned version absent from registry; verified live via express@99.99.99),
  `typosquat` (near-miss of a popular name from the bundled npm-high-impact
  corpus; self-membership suppression first, then risk-gated; verified live:
  self-scan clean, lodahs/webback flag), `hallucination-name` (token
  recombination: reorder or convention-affix drop; verified live: the
  documented `unused-imports` slopsquat is now flagged as an affix-drop of
  eslint-plugin-unused-imports, which every prior check missed). The live
  self-scan and established packages (express, left-pad, react-router-dom)
  stay clean (no false positives).
  Lockfile v2/v3 resolution done: `scan` reads the resolved package-lock.json
  tree (transitive deps + exact versions), falls back to the manifest with a
  warning otherwise; unpublished-version now fires at scan time (verified live
  on a lockfile pinning express@99.99.99). CI dogfood runs `--offline` for
  determinism; install-scripts uses age as an establishment proxy when adoption
  is unknown (fsevents no longer false-positives under rate-limit).
  CI integration done: `--json`, `--sarif`, `--fail-on`; `action.yml` (composite,
  npx-based, resolves on npm publish) and `.github/workflows/pr-scan.yml` (scans
  our own PRs from source now, uploads SARIF, writes a job summary). All free:
  runs on GitHub runners, no server.
  hallucination-name covers affix-drop and reorder/scope-drop; cross-package
  novel-token blends (react-codeshift) remain out of scope.
- 2026-07-21: **Published.** Repo moved to github.com/tallyguard/vetguard
  (protected, verified end to end). Version single-sourced from package.json;
  lean 126 kB tarball. Release flow is OIDC trusted publishing (no token;
  Node 24 + npm >= 11.5.1; provenance automatic). One-time bootstrap done by
  the maintainer, trusted publisher registered, GitHub Release v0.1.0 cut:
  **vetguard@0.1.0 is live on npm with a verified provenance attestation**
  (`npx vetguard` works; placeholder 0.0.0 unpublished by the maintainer).
- 2026-07-21: **Roadmap M1 (frictionless adoption) in progress.** M1.1 done
  (Action pins @v0.1.0, README/RELEASING match published reality, README notes
  self-scanning; `main` protection tightened so only the owner merges and a
  review is required for anyone else). M1.2 done: `diff` mode (`vetguard diff
--base <lockfile> [--head]`) scans only dependencies a change introduces
  (head-vs-base set difference), plus `--markdown` output for PR comments;
  verified live (an introduced typosquat flags, unchanged deps are skipped).
  M1.7 done: verifiable "Is vetguard itself safe?" README section + repo
  metadata. M1.3 done: `vetguard.config.json` (failOn, offline, and
  `ignore` suppressions that require a reason and are shown as suppressed, not
  hidden; CLI flags override config). `main` protection now requires a review
  and restricts merges to the owner.
  M1.4 done: `vetguard baseline` records current findings to
  `.vetguard-baseline.json`; later scans report those as baselined (suppressed)
  and fail only on new findings; verified live end to end.
  M1.5 done: terminal polish, ANSI colors by severity (TTY-gated, NO_COLOR /
  --no-color respected) and `--quiet` (findings + verdict only).
  M1.6 done: the GitHub Action gains a `comment: true` input posting one
  sticky PR comment (updated in place, never stacked); dogfooded in
  `.github/workflows/pr-scan.yml`. **Milestone 1 (frictionless adoption)
  complete.**
- 2026-07-21: **v0.2.0 published; Milestone 1 audit remediated.** A full audit
  of the seven M1 PRs produced eight findings (tracked in
  AUDIT-M1-REMEDIATION.md), all closed. The self-scan now has real teeth via
  offline-capable name detection: typosquat and hallucination-name fire on a
  corpus resemblance during an `--offline` scan (low severity), reason-threaded
  so a transient online failure never false-positives; an introduced look-alike
  is caught with no network and fails CI. Also: stale docs fixed, the diff
  resolved-identity key decision recorded, the sticky-comment lookup hardened to
  the actions bot, and the repo hardened (squash-only, delete-branch-on-merge,
  secret scanning + push protection, Dependabot; vitest bumped to 4 after a
  full-gate check). **vetguard@0.2.0 is live on npm with a verified provenance
  attestation.**
- 2026-07-21: **Milestone 2 started. M2.1 known-cve (DONE).** The `known-cve`
  detector checks each exact resolved `name@version` against OSV.dev (batched,
  in-run cached, `--offline`-gated) and degrades to could-not-verify on any
  lookup failure or a version-less scan; severity is the higher of the GHSA label
  and a hand-rolled CVSS v3 base score, clamped to at least low and floored to
  medium. Verified live: `check lodash@4.17.4` flags GHSA-jf85-cpcp-j695
  (critical) and others, a current exact version is clean, offline is
  could-not-verify.
- 2026-07-22: **M2.2 accuracy evaluation harness (DONE).**
  `scripts/evaluate.ts` runs the offline-capable detectors against the top-1000
  popular packages (must be zero findings) and a labeled positive corpus (each
  must flag with the expected rule), exiting non-zero on any regression. It gates
  CI, runs weekly (`evaluate.yml`), and gates the release. Proven: 0 false
  positives, 6/6 positives flagged; a planted miss fails it.
- 2026-07-22: **M2.4 scoped-name coverage (DONE).** New `scoped-lookalike`
  detector: an unscoped name that is a dropped-scope lookalike of a popular
  scoped package (`babel-core` for `@babel/core`) flags, risk-gated like
  typosquat and offline-capable; the scoped package itself, corpus members
  (real legacy unscoped forms), and the `@types` scope are never suspects.
  Verified live: `jridgewell-trace-mapping` flags scoped-lookalike, `types-node`
  and `@babel/core` stay clean of it.
- 2026-07-22: **M2.3 corpus refresh automation (DONE).** `refresh-corpus.yml`
  regenerates the bundled corpus monthly and opens a PR only when the name list
  changes (a timestamp-only diff is ignored), never direct-pushing to main.
  Change-detection proven locally. Caveat: the org disallows Actions creating
  PRs, so the step falls back to pushing a branch + a compare link until the
  org-level setting is enabled (see DECISIONS). Next: M2.5 repo-mismatch detector
  (needs bundled repo-URL data), or M3 (reach: yarn/pnpm lockfiles, workspaces).

## Stack

TypeScript (ESM), Node >=20 (`.nvmrc` = 22), Vitest, eslint 9 flat config +
prettier, tsup. Zero runtime dependencies so far (Node built-ins only:
`node:util` parseArgs, `fs`, `fetch`). Near-zero runtime deps is a product
principle; each addition needs a DECISIONS.md entry.

## Commands

See CLAUDE.md section 3. Gate: `npm run typecheck | lint | format:check | test`,
`npm run build`. Run from source: `npm run dev`. Scan: `npm run dev scan [dir]`
or `node dist/cli.js scan [dir]` after build.

## Structure

- `CLAUDE.md` - operating rules for AI-assisted work.
- `docs/` - index (INDEX.md), this cache, decisions, plan, prior-art.
- `src/core/` - `model.ts` (types), `engine.ts` (runDetectors + verdict),
  `diff.ts` (`introducedFacts`: head-vs-base set difference), `ignore.ts`
  (`applyIgnores`: config suppressions), `rules/` (pure detectors + registry
  index).
- `src/config.ts` - loads/validates `vetguard.config.json` (failOn, offline,
  ignore-with-mandatory-reason). `src/baseline-io.ts` - reads/writes
  `.vetguard-baseline.json`; `src/core/baseline.ts` - pure `applyBaseline`.
- `src/ecosystems/npm/` - `manifest.ts` (package.json reader, source
  classification), `registry.ts` (registry client), `downloads.ts` (downloads
  API client), `enrich.ts` (folds registry + downloads facts into
  PackageFacts, computes ageDays), `spec.ts` (`check` argument parser),
  `popular.ts` (corpus indexes + near-miss lookup), `lockfile.ts` (package-lock
  v2/v3 resolver), `osv.ts` (OSV advisory client), `cvss.ts` (severity resolver),
  `data/popular-packages.ts` (generated npm-high-impact snapshot). Tarball
  collector lands next.
- `src/scan.ts` - `scanProject` / `checkPackage` / `diffScan` orchestration
  (used by the CLI and tests; keeps the CLI thin).
- `src/util/` - `concurrency.ts` (bounded parallel map), `names.ts` (pure
  name-distance helpers).
- `scripts/refresh-popular.mjs` - dev-only corpus regenerator (`npm run
refresh:popular`). `scripts/evaluate.ts` - accuracy eval harness (`npm run
evaluate`): top-1000 popular clean + labeled positives flag, offline and
  deterministic; a regression exits non-zero.
- `src/output/` - `terminal.ts`, `color.ts` (ANSI severity colors), `json.ts`,
  `sarif.ts` (GitHub code scanning), `markdown.ts` (PR comment / job summary),
  `exit-code.ts` (`--fail-on` gating).
- `tests/dogfood/self-scan.test.ts` - vetguard scans its own repo offline on
  every test run (see CLAUDE.md section 7).
- `src/cli.ts` - CLI entry (shebang preserved by esbuild). `src/index.ts` -
  public library API.
- `tests/unit/` - Vitest unit tests.
- `.github/workflows/ci.yml` - the gate on Node 20 + 22 (typecheck, lint,
  format, test, build, offline dogfood, accuracy eval). `evaluate.yml` - weekly
  scheduled accuracy eval; the eval also gates `release.yml`. `refresh-corpus.yml`
  - monthly corpus regeneration that opens a data-only PR when it changes.
- Governance (public repo): `CONTRIBUTING.md`, `SECURITY.md` (private
  disclosure), `CODE_OF_CONDUCT.md`, `.github/` PR and issue templates.

## External services and data sources

Wired: npm registry API (`registry.ts`), npm downloads API (`downloads.ts`),
OSV.dev advisory API (`osv.ts`, batched + in-run cached), all optional at runtime
(`--offline`) and degrading to could-not-verify on failure. Bundled data:
npm-high-impact corpus (dev-refreshed, not a runtime call). Cross-run disk cache
is still a follow-up.

## Open questions (blocking, per gating rules)

- None blocking. Non-blocking: local directory is still
  "npm-package-vulenrability-detector" (a typo, unrelated to the package
  name); rename is optional and does not affect anything.

## Known caveats

- Version is single-sourced from package.json (read at runtime by
  `src/index.ts`); current published release is vetguard@0.2.0.
- `npm audit` is clean. Shipped code has zero runtime dependencies, so a dev
  dependency advisory (build/test toolchain) never reaches users; esbuild is
  pinned via `overrides` to stay ahead of GHSA-g7r4-m6w7-qqqr (see DECISIONS).
