# Project state

The live cache. Current facts only; if a change makes a line here wrong,
fixing it is part of that change. Dates are absolute (YYYY-MM-DD).

Last verified: 2026-07-21

## What this is

A free, open-source, local-first scanner for AI-era npm supply-chain
threats: hallucinated (slopsquatted) dependencies, typosquats, malicious
young packages, prompt injection aimed at coding agents, plus known-CVE
lookup. CLI (`scan` / `check` / `diff`) + GitHub Action. Ecosystem-agnostic
core, npm adapter first. Full plan: PLAN.md. Decisions: DECISIONS.md.

## Status

- 2026-07-21: **Phase 0 complete.** Named `vetguard`, Apache-2.0, public repo
  (github.com/Poolchaos/vetguard, `main` protected). Toolchain, core model +
  engine, npm manifest reader, `nonexistent-package` detector, terminal
  output, CLI, CI, and open-source governance shipped and pushed.
- 2026-07-21: **Phase 1 in progress.** Registry client, registry enrichment
  collector, and `check <pkg>` landed (PR #1). `nonexistent-package` fires on
  real lookups. Dogfood self-scan test + scan orchestration extracted (PR #2).
  Downloads collector (npm downloads API), package-age (`ageDays`) and
  `versionCount` facts, and the `young-package` detector landed (PR #3).
  Detectors live: `nonexistent-package`, `young-package`. Verified: live
  self-scan and established packages (express, left-pad, @ui5/cli) stay clean
  (no false positives); young-package firing logic covered by unit tests
  including the age boundary. Note: `react-codeshift` now EXISTS on the
  registry (already squatted), so nonexistent-package cannot catch it, which
  is why young-package and the name-similarity detectors matter.
  Next: `typosquat` / `hallucination-name` (name-similarity vs a bundled
  popular-package corpus), `install-scripts`, `unpublished-version` (facts
  already collected); lockfile v2/v3 resolution; cross-run disk cache; JSON
  output.

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
  `rules/` (pure detectors + registry index).
- `src/ecosystems/npm/` - `manifest.ts` (package.json reader, source
  classification), `registry.ts` (registry client), `downloads.ts` (downloads
  API client), `enrich.ts` (folds registry + downloads facts into
  PackageFacts, computes ageDays), `spec.ts` (`check` argument parser).
  Lockfile/tarball collectors land next.
- `src/scan.ts` - `scanProject` / `checkPackage` orchestration (used by the
  CLI and tests; keeps the CLI thin).
- `src/util/` - `concurrency.ts` (bounded parallel map, dependency-free).
- `src/output/` - `terminal.ts`. json/sarif/markdown come later.
- `tests/dogfood/self-scan.test.ts` - vetguard scans its own repo offline on
  every test run (see CLAUDE.md section 7).
- `src/cli.ts` - CLI entry (shebang preserved by esbuild). `src/index.ts` -
  public library API.
- `tests/unit/` - Vitest unit tests (6 passing).
- `.github/workflows/ci.yml` - the gate on Node 20 + 22.
- Governance (public repo): `CONTRIBUTING.md`, `SECURITY.md` (private
  disclosure), `CODE_OF_CONDUCT.md`, `.github/` PR and issue templates.

## External services and data sources

Planned (PLAN.md), none wired yet: npm registry API, npm downloads API,
OSV.dev batch API. All to be optional at runtime (`--offline`); responses
cached locally.

## Open questions (blocking, per gating rules)

- None blocking. Next action: user creates the public GitHub repo for
  `vetguard`. Non-blocking: local directory is still
  "npm-package-vulenrability-detector" (a typo, unrelated to the package
  name); rename is optional and does not affect anything.

## Known caveats

- `VERSION` is hardcoded as "0.0.0" in `src/index.ts` and mirrored in
  package.json; wire it to a single source before the first publish.
- `npm audit` reports vulnerabilities in dev dependencies only (build/test
  toolchain), not shipped code. Revisit before publish.
