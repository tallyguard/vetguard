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
- 2026-07-21: **Phase 1 in progress.** Registry client (injectable fetch,
  in-run memoization, offline-safe, honest degradation), registry enrichment
  collector, and the `check <pkg>` command landed. `nonexistent-package` now
  fires on real lookups. Verified live: `check express` clean; a nonexistent
  name flags HIGH (exit 1); `--offline` reports could-not-verify. Note:
  `react-codeshift` (the documented hallucinated name) now EXISTS on the
  registry, so nonexistent-package does not catch it. That is expected and is
  the reason the post-registration detectors below are the next priority.
  Next: npm downloads API + `young-package`, then `typosquat` /
  `hallucination-name` (name-similarity vs a popular corpus),
  `install-scripts`, `unpublished-version`; lockfile v2/v3 resolution;
  cross-run disk cache; JSON output.

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
  classification), `registry.ts` (registry client), `enrich.ts` (folds
  registry facts into PackageFacts), `spec.ts` (`check` argument parser).
  Lockfile/tarball collectors land next.
- `src/util/` - `concurrency.ts` (bounded parallel map, dependency-free).
- `src/output/` - `terminal.ts`. json/sarif/markdown come later.
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
