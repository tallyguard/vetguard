# Plan: AI-era supply-chain scanner for npm

Written 2026-07-21. The implementation plan for the MVP and beyond. Read
[PRIOR-ART.md](PRIOR-ART.md) for the landscape this positioning comes from.
Update this file as phases complete; it is the resumable plan of record.

## Mission

A free, open-source, local-first tool that catches the supply-chain threats
AI-assisted development created: hallucinated (slopsquatted) dependencies,
typosquats, malicious young packages, and prompt injection aimed at coding
agents. Installable as an npm CLI, runnable in CI against PRs, with no
account, no server, and no telemetry.

## Product principles (proposed as standing rules once confirmed)

1. **Near-zero runtime dependencies.** A supply-chain security tool that
   ships 300 transitive dependencies refutes itself. Use Node built-ins
   (fetch, fs, streams). Every runtime dependency added requires a
   DECISIONS.md entry justifying it.
2. **No telemetry, no phone-home.** The only network calls are the lookups
   the scan needs (npm registry, downloads API, OSV), and `--offline`
   disables even those. A user's dependency list is sensitive data.
3. **Never execute scanned code.** Parse as data only (already law in
   CLAUDE.md section 4).
4. **Traceable verdicts.** Every finding carries: rule id, severity,
   confidence, the concrete evidence (file, line, registry field), and a
   "why this matters" line. No unexplainable scores.
5. **Degrade honestly.** Registry unreachable means "unknown", never "safe".
   The report distinguishes clean / findings / could-not-verify.
6. **False-positive budget.** The top-1000 most-downloaded npm packages must
   scan clean (or allowlisted with reasons) on every release. A noisy scanner
   gets uninstalled; measured FP rate is a release gate, not a hope.

## Architecture

Ecosystem-agnostic core with pluggable ecosystem adapters; npm is the first
adapter. The hard boundary: **collection is separated from judgment.**

```
src/
  core/
    model.ts        PackageFacts, Finding, Report, Severity, Confidence
    engine.ts       orchestrates collect -> rules -> report
    rules/          detectors: pure functions (PackageFacts) -> Finding[]
    scoring.ts      severity/confidence aggregation
  ecosystems/
    npm/
      manifest.ts   package.json parsing (workspaces, aliases, git/file deps)
      lockfile.ts   package-lock v2/v3 first; yarn/pnpm staged later
      registry.ts   registry + downloads API client, cache, backoff
      tarball.ts    safe streaming inspection (zip-slip proof, size-capped)
      popular.ts    bundled top-N package corpus for distance checks
  analysis/
    capabilities.ts network/fs/child_process/eval/env-harvest signals
    obfuscation.ts  entropy, hex/base64 blobs, minified-only detection
    injection.ts    agent-targeting prompt injection heuristics
    names.ts        Levenshtein, token-recombination, homoglyph detection
  output/
    terminal.ts json.ts sarif.ts markdown.ts   (markdown = PR comment body)
  cli.ts
action/             thin GitHub Action wrapper around `diff` mode
data/
  popular-packages.json   top-N corpus, refreshed by a scripted job
  hallucinated-names.json community-maintained known-slopsquat list
```

Detectors are pure and data-driven: facts go in, findings come out, nothing
does IO. All IO lives in collectors. This is what makes the test strategy
below cheap.

## Scan modes

- `scan [dir]` - whole project: manifest + lockfile (+ `node_modules`
  contents when present) through all detectors.
- `check <name>[@version]` - vet a single package before installing. This is
  also the coding-agent integration point: agents call it as a gate before
  adding a dependency (ships with a documented Claude Code hook example).
- `diff <base-lockfile> <head-lockfile>` - PR mode: evaluate only added or
  changed packages; exit nonzero on findings at or above a threshold;
  markdown and SARIF output for PR comments and GitHub code scanning.

## Detector catalog

MVP (phase 1-2), roughly by value:

| Rule                  | Signal                                                                                                                                   | Why                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| nonexistent-package   | dependency 404s on registry                                                                                                              | direct hallucination hit before an attacker registers it |
| hallucination-name    | token-recombination and similarity vs popular corpus (react-codeshift pattern), plus known-slopsquat list                                | the predictable-hallucination attack                     |
| typosquat             | edit distance / homoglyph vs popular corpus                                                                                              | classic squatting                                        |
| young-package         | registration age, version history depth, weekly downloads                                                                                | fresh registrations are where malware lives              |
| unpublished-version   | version in lockfile no longer on registry                                                                                                | frequent sign of removed malware                         |
| install-scripts       | pre/post/install in manifest, especially newly added in a diff                                                                           | the classic execution vector                             |
| capability-signals    | network + fs + child_process + eval + process.env harvesting in package code                                                             | exfil and dropper patterns                               |
| obfuscation           | entropy, hex/base64 blobs, minified-only with no linked repo                                                                             | hiding behavior                                          |
| repo-mismatch         | repository field missing, or points at a different, popular project                                                                      | impersonation                                            |
| readme-impersonation  | README near-copy of a popular package                                                                                                    | impersonation                                            |
| agent-injection       | imperative agent-directed text, zero-width/RTL unicode, base64 blocks in README/comments; package ships CLAUDE.md/.cursorrules/AGENTS.md | Clinejection-class attacks on coding agents              |
| lockfile-integrity    | resolved URL not registry.npmjs.org, missing integrity hash                                                                              | dependency confusion, tampered lockfile                  |
| manifest-confusion    | tarball package.json differs from registry manifest                                                                                      | known npm blind spot                                     |
| known-cve             | OSV.dev batch lookup                                                                                                                     | table stakes for a complete verdict                      |
| private-name-exposure | private/workspace package name also exists on public registry                                                                            | dependency confusion setup                               |

Later: maintainer-change velocity, dist-tag anomalies, watch mode, community
rule packs (JSON rule format so outsiders can contribute detectors without
touching core).

## Edge cases register (design for these from day one)

Input shapes:

- Monorepos: npm/yarn/pnpm workspaces, multiple manifests, `workspace:` protocol.
- Lockfiles: package-lock v1 (legacy) vs v2/v3; yarn classic vs berry;
  pnpm-lock.yaml; bun.lockb is binary. MVP: package-lock v2/v3; others
  detected and reported as "unsupported yet", never silently skipped.
- Dependency notations: scoped (@scope/name), aliases (npm:real@1.0.0),
  git+https/file:/link: deps (no registry record; report as unverifiable),
  bundleDependencies, optional and peer deps.
- Scope tricks: @types/foo vs foo confusion, lookalike scopes.

Hostile input (the scanner is itself an attack surface):

- Tarballs with path-traversal entries (zip-slip) - stream entries, never
  extract to disk with archive-supplied paths.
- Decompression bombs and huge files - hard size and entry caps.
- Unicode: homoglyph names, RTL overrides, zero-width chars in names and docs.
- Malformed JSON manifests and lockfiles - fail with a finding, not a crash.
- The scan target may try to prompt-inject the AI reading the report:
  findings quote evidence as escaped, truncated text, never as live content.

Operational:

- Registry and OSV rate limits: local cache (XDG cache dir, TTL), request
  batching, backoff; CI-friendly.
- `--offline` mode: skip network, verdict "could-not-verify" honestly.
- Privacy: dependency names leak to whatever API we query; document this,
  batch queries, and keep `--offline` a first-class path.
- Performance: large node_modules trees; stream, cap, parallelize with a
  worker budget.
- Legitimate uses of scary signals: esbuild has install scripts, sharp
  compiles natively. Popularity-aware severity plus a curated known-good
  list; suppression file (`.config` entry) with mandatory reason strings;
  baseline mode for adopting on brownfield projects.
- Determinism in CI: same inputs and same data snapshot produce the same
  report; report records data-source timestamps.

## Testing strategy

- **Unit per detector**: crafted fixture packages under `tests/fixtures/`
  (benign and malicious-pattern samples we author ourselves; never ship real
  malware). Pure detectors make these trivial: facts in, findings asserted.
- **Collector integration**: recorded registry/OSV responses (nock or
  undici mock); zero live network in the default test run. A separate,
  manually-run smoke job hits live APIs.
- **Golden report tests**: snapshot terminal/JSON/SARIF/markdown output for
  fixture projects so output regressions are visible in diffs.
- **Hostile-input tests**: zip-slip tarball, decompression bomb, malformed
  JSON, unicode tricks. These are security tests and stop-the-line.
- **Corpus evaluation** (release gate, scripted): precision/recall against a
  labeled corpus (seeded from the public benchmark in PRIOR-ART.md), and FP
  rate over the top-1000 popular packages. Numbers go in the release notes.
- **E2E**: run the built CLI against fixture projects (npm project, workspace
  monorepo, project with yarn lockfile to prove the "unsupported" path).
- **Dogfood**: the repo scans itself in CI and must pass.

## Roadmap

- **Phase 0 - scaffold** (DONE 2026-07-21): TypeScript, Node >=20, Vitest,
  eslint + prettier, tsup build, GitHub Actions CI (typecheck, lint,
  format:check, test, build, dogfood scan). Shipped the core model + engine,
  npm manifest reader, the `nonexistent-package` detector, terminal output,
  and the CLI (`scan`/`--help`/`--version`) wired end to end. Gate green
  locally; CLAUDE.md sections 3-4-7 filled in.
- **Phase 1 - core + first verdicts** (IN PROGRESS): engine, npm
  manifest/lockfile (v2/v3) collectors, registry client with cache, `scan`
  and `check`, detectors: nonexistent-package, young-package, typosquat,
  hallucination-name, install-scripts, unpublished-version. Terminal + JSON
  output. Done when hallucinated/nonexistent names flag correctly and the
  top-100 popular packages scan clean.
  - Done: registry client (injectable fetch, in-run memoization, offline,
    honest degradation), downloads client, enrichment collector (folds
    registry + downloads facts, computes ageDays), `check` command,
    detectors nonexistent-package and young-package firing on live lookups.
  - Also done: install-scripts detector (install lifecycle script correlated
    with risk facts; popular packages suppressed to hold the FP budget).
  - Follow-ups queued: typosquat and hallucination-name (needs the bundled
    popular-package corpus); unpublished-version (facts already collected);
    lockfile v2/v3 resolution; cross-run disk cache (currently in-run memo
    only); JSON output; then Phase 2 behavioural/backdoor detectors
    (capability-signals, obfuscation, agent-injection).
- **Phase 2 - deep analysis**: tarball/node_modules inspection, capability
  and obfuscation signals, agent-injection detector, OSV known-cve,
  lockfile-integrity, manifest-confusion. Hostile-input tests land here.
- **Phase 3 - PR workflow**: `diff` mode, GitHub Action, SARIF + markdown
  output, suppression/baseline UX, corpus evaluation as release gate.
- **Phase 4 - reach**: yarn/pnpm lockfiles, workspaces, npm publish with
  provenance, docs site, community rule format, hallucinated-names community
  list process.
- **Phase 5 - second ecosystem**: PyPI adapter proving the core abstraction;
  whatever the core got wrong gets refactored here, not before.

## Distribution and integrations

- npm package with `npx` support; publish with `--provenance` from CI.
- GitHub Action in the same repo (`action/`), usable as `uses: <org>/<repo>@v1`.
- SARIF output plugs into GitHub code scanning for free annotation.
- Documented coding-agent integration: a Claude Code PreToolUse-style hook
  example that runs `check` before any `npm install <pkg>` an agent attempts.
  The tool the AI era needs should be usable by the agents themselves.

## Open questions

- Resolved 2026-07-21: name `vetguard`, license Apache-2.0, public repo (see
  DECISIONS.md).
- Non-blocking: local directory still has the "vulenrability" typo; unrelated
  to the package name, rename optional.
