# Roadmap: v0.1.0 to a tool all developers want to use

Written 2026-07-21, immediately after the first npm publish. This is the
execution plan for the next working sessions. It sequences the remaining work
from PLAN.md into milestones with concrete items, design constraints, and a
definition of done per item. PLAN.md stays authoritative for architecture and
the detector catalog; this file is authoritative for what to build next and in
what order.

## Starting point (verified 2026-07-21)

`vetguard@0.1.0` is live on npm with provenance, published tokenless via OIDC
from github.com/tallyguard/vetguard. Six detectors (nonexistent-package,
young-package, install-scripts, unpublished-version, typosquat,
hallucination-name), full-tree package-lock v2/v3 scanning with honest
manifest fallback, text/JSON/SARIF output, `--fail-on`, a composite GitHub
Action, a self-dogfooding PR scan, 103 tests at first publish, protected green
main.

## Operating instructions for the executing session

- Start by reading docs/PROJECT-STATE.md, then this file. Work top to bottom
  unless the maintainer redirects.
- Every item follows the CLAUDE.md per-change loop: one feature per
  `type/slug` branch, full gate green, live proof against real packages,
  docs and README updated in the same PR, squash-merge, delete branch.
- A detector change without a live true-positive and a live clean control is
  not done. The false-positive budget is stop-the-line: the self-scan and the
  established-package controls must stay clean in every PR.
- No new runtime dependencies without a DECISIONS.md entry. Prefer Node
  built-ins; the near-zero-deps principle is part of the product.
- Never commit real malware. Fixtures carry the pattern, authored by hand.
- Publishing is maintainer-gated: cutting a GitHub Release requires explicit
  approval in the conversation. Everything up to the release PR is delegated.
- Research subagents must be read-only (Explore type); a general-purpose
  subagent once edited the working tree mid-task. After any subagent run,
  check `git status` before proceeding.

## Product thesis

Developers adopt a security scanner when it is trustworthy (verdicts they can
check, near-zero false positives), complete (catches what npm audit misses
without missing what it catches), fast (seconds, cached, CI-friendly),
everywhere (their lockfile, their CI, their editor agent), and frictionless
(one command, one workflow line, adoptable on a messy brownfield repo without
a wall of noise). Free, local, no account, no telemetry stays non-negotiable;
it is the distribution advantage over Socket and Snyk.

Success signals (no telemetry, public numbers only): npm weekly downloads,
GitHub stars, Action adoption visible in public repos, external issues and
PRs, packages reported to the community slopsquat list.

## Milestone 1: Frictionless adoption (COMPLETE)

Goal: someone who has never heard of vetguard gets value in under five
minutes, on a real repo, without reading docs.

- **1.1 Action tag hygiene (DONE).** Fix the README example (`@v1` tag does not
  exist). Adopt the standard convention: keep a moving `v1` major tag once
  v1.0 ships; until then document pinning `@v0.1.0`. Update RELEASING.md with
  the tag policy and trim its completed one-time bootstrap sections to a
  short "already done" note. Done when README and RELEASING match reality.
- **1.2 `diff` mode (DONE).** `vetguard diff --base <lockfile> [--head <lockfile>]`
  (head defaults to ./package-lock.json): evaluate only dependencies added or
  version-changed between base and head. This is the highest-signal moment, a
  new dependency entering a PR. Output: terminal, JSON, SARIF, plus a compact
  markdown section for PR comments. Exit codes honor `--fail-on`. Done when a
  crafted base/head pair flags only the introduced package and the Action can
  run it on a PR (fetch base lockfile via `git show`; document fetch-depth).
- **1.3 Config file with mandatory reasons (DONE).** `vetguard.config.json`
  (documented schema): default `failOn`, `offline`, and
  `ignore: [{rule, package, reason}]` where reason is required and rendered
  in the report as "suppressed (reason)". CLI flags override config. Done
  when an ignored finding shows as suppressed, not hidden, and an ignore
  without a reason is a config error.
- **1.4 Baseline for brownfield adoption (DONE).** `vetguard baseline` writes
  current findings to `.vetguard-baseline.json`; subsequent scans fail only
  on findings not in the baseline and report the baselined count. This is the
  single biggest unlock for existing repos: adopt today, ratchet later. Done
  when a repo with pre-existing findings passes CI after baselining and a
  newly introduced finding still fails.
- **1.5 Terminal polish (DONE).** ANSI colors by severity (hand-rolled, zero deps),
  TTY detection, `NO_COLOR` and `--no-color` respected, aligned columns,
  `--quiet` (findings and verdict only). Done when output is readable in a
  dark terminal, a light terminal, and a CI log.
- **1.6 Action PR comment (DONE).** Optional `comment: true` input posts or updates
  a single sticky PR comment with the markdown report using the built-in
  GITHUB_TOKEN (`pull-requests: write` documented). Default off; job summary
  and SARIF annotations remain the default surface. Done when repeated runs
  update one comment instead of stacking.
- **1.7 "Is vetguard itself safe?" (DONE).** A verifiable trust section in the
  README, provenance, zero runtime deps, no install scripts, no code
  execution, no telemetry, self-scanning, each with a way for the reader to
  check it themselves. A security scanner is exactly what an attacker would
  disguise malware as, so self-trust is a first-class adoption factor. Also
  set the repo description, homepage, and topics. Revisit at launch (M5) with
  an OpenSSF Scorecard badge and a `CHANGELOG`.

## Milestone 2: Complete and correct verdicts

Goal: vetguard is a complete answer (a dev needs no second scanner for
dependencies) and its accuracy is measured, not asserted.

- **2.1 known-cve via OSV.dev (DONE).** Batch query resolved name@version pairs
  against the OSV API (batched, cached, offline-honest, `unverified` on API
  failure). Map severity from CVSS ranges; evidence links the advisory ID and
  URL. This is table stakes: without it devs must still run npm audit. Done
  when a deliberately old known-vulnerable version (e.g. an old lodash) flags
  with the right advisory and a current version stays clean.
- **2.2 Accuracy evaluation harness as a release gate (DONE).**
  `scripts/evaluate.ts` runs the offline-capable detectors against (a) the
  top-1000 popular packages, which must scan clean, and (b) a labeled positive
  corpus (names plus expected rule, no malware content) seeded with the
  documented real cases (unused-imports class, crafted typo and recombination
  names), which must flag. Runs in the CI gate, weekly on a schedule
  (`evaluate.yml`), and before every release (`release.yml`). A regression is
  stop-the-line. Done when the workflow runs
  green on a schedule and a deliberately broken threshold fails it.
- **2.3 Corpus refresh automation (DONE).** Monthly scheduled workflow regenerates
  the popular-package corpus with the existing refresh script and opens a PR
  (never direct-push). Corpus staleness is a documented FP risk; this manages
  it. Done when a scheduled run produces a mergeable PR with only data
  changes.
- **2.4 Scoped-name coverage (DONE).** Close the "scoped names skipped" gap using
  the research already in docs/PRIOR-ART.md: flag the risky direction only,
  an unscoped or wrong-scope lookalike of a popular scoped package (bare
  `babel-core` against `@babel/core`), allowlist `@types/*` and known mirror
  scopes, keep the ownership-gated direction suppressed. Risk-gated like all
  name detectors. Done with live proof plus @types and org-scope clean
  controls.
- **2.5 repo-mismatch detector.** Flags a package whose repository field
  points at a different popular project (impersonation). Facts are already
  collected. Risk-gated; missing repository alone is at most info. Done with
  a live impersonation-pattern fixture and popular-package clean controls.
- **2.6 private-name-exposure detector.** In workspace scans, flag a private
  or workspace package name that also exists on the public registry
  (dependency-confusion setup). Depends on 3.4 for workspace awareness; can
  land after it.

## Milestone 3: Everywhere developers are

Goal: whatever the repo looks like, `vetguard scan` just works, and fast.

- **3.1 yarn.lock (classic) parser.** Same collector contract as
  package-lock: resolved versions, registry sources, dedupe. Unsupported
  yarn features degrade honestly.
- **3.2 yarn berry parser.** Separate item; different format.
- **3.3 pnpm-lock.yaml parser.** YAML without a YAML dependency is the
  constraint to solve deliberately: either a minimal purpose-built parser for
  the known lockfile subset, or a justified dev-time-generated approach;
  decision recorded in DECISIONS.md. pnpm is too big a population to leave on
  manifest fallback.
- **3.4 Workspaces and monorepos.** Detect npm/yarn/pnpm workspaces, scan all
  member manifests against the root lockfile, dedupe, and record which
  workspace a finding came from. Unlocks 2.6.
- **3.5 Cross-run disk cache.** XDG cache dir, TTL per source (registry,
  downloads, OSV), keyed by name@version plus integrity, `--no-cache` flag,
  documented in the privacy section. Target: a warm re-scan of a 300-package
  tree in under two seconds. bun.lockb stays detected-and-reported as
  unsupported.
- **3.6 Guardrail recipes.** Documented, copy-paste: pre-commit/husky hook,
  a CI snippet for GitLab (the CLI is CI-agnostic even if the Action is
  GitHub-only), and an npm-wrapper alias for pre-install vetting.
- **3.7 Coding-agent gate (marquee).** Ship the documented Claude Code hook
  that runs `vetguard check <pkg>` before any `npm install` an agent
  attempts, plus generic guidance for other agents (Cursor, Copilot CLI).
  The thesis feature: the agents causing slopsquat risk become vetguard
  users. Done when the hook blocks a hallucinated install in a live demo
  recorded in the docs.

## Milestone 4: Backdoor and behaviour depth (flagship differentiation)

Goal: catch what name-and-metadata analysis cannot, malicious code behavior,
while holding the FP budget. This is the deepest work; every item here is
security-sensitive and gets hostile-input tests.

- **4.0 Tiering design note first (no code).** Deep inspection costs
  downloads and time, so define which packages get it: new-in-diff, young,
  low-adoption, or already flagged by another rule; established packages get
  metadata-only depth. The report records per-package depth so a skipped deep
  scan is visible, never implied-safe. Write the note into PLAN.md before
  implementing.
- **4.1 Safe tarball collector.** Stream the registry tarball (size-capped,
  entry-capped, decompression-bomb-guarded, zip-slip-proof, never extracted
  with archive-supplied paths, never executed), cache by integrity, produce
  per-file facts for detectors. This is the security-critical foundation; it
  lands with the hostile-input test suite (crafted zip-slip fixture, bomb,
  malformed archives, unicode filenames), which is stop-the-line.
- **4.2 capability-signals detector.** Network, filesystem-write,
  child_process, eval/Function, and process.env-harvesting patterns in
  package code, correlated with risk facts so a young low-adoption package
  with exfil-shaped code flags high while an established SDK does not.
  Evidence is file plus escaped, truncated excerpt.
- **4.3 obfuscation detector.** Entropy, long hex/base64 blobs, minified-only
  code with no linked repository.
- **4.4 manifest-confusion detector.** Tarball package.json differs from the
  registry manifest (name, version, scripts), a known npm blind spot.
- **4.5 agent-injection detector.** Instruction-like text aimed at coding
  agents in READMEs, package fields, and comments; zero-width and RTL
  unicode; packages shipping CLAUDE.md / .cursorrules / AGENTS.md. All quoted
  evidence stays escaped and truncated so the report itself cannot become an
  injection vector.
- **4.6 lockfile-integrity detector (consider pulling forward).** Resolved URL
  not on registry.npmjs.org, missing integrity hashes, or a same-version
  repoint. The M1.2 diff-mode review showed diff mode can currently only report
  a lockfile-poisoning repoint (same version, swapped `resolved`/`integrity`)
  as "could not verify", not flag it, because no detector owns that signal.
  This detector closes that gap and is arguably worth landing in M2 rather than
  waiting for M4.

Ordering note: milestones 3 and 4 are swappable. Reach (3) serves "all devs"
fastest; depth (4) is the differentiator the maintainer has repeatedly asked
about. Default order is 3 then 4; ask the maintainer at the start of the
session that reaches this fork.

## Milestone 5: Community and launch

Goal: people can find vetguard, trust it at a glance, and contribute to it.

- **5.1 Honest comparison doc.** vetguard vs npm audit, Socket, GuardDog,
  Snyk: what each catches, what each costs, where vetguard deliberately does
  less. Concrete claims only, per the no-marketing-fluff rule; this page
  earns trust precisely by being honest about competitors' strengths.
- **5.2 Community slopsquat list.** `data/hallucinated-names.json` with a
  "report a slopsquat" issue template and a documented review bar;
  hallucination-name gains a known-list branch. Contributors get an easy
  first PR.
- **5.3 Marketplace and badges.** Publish the Action to the GitHub
  Marketplace (maintainer clicks, documented steps), add npm/CI badges to the
  README, and provide a "scanned with vetguard" badge snippet for adopters.
- **5.4 Launch kit.** A terminal demo recording (asciinema or GIF) showing a
  hallucinated dependency caught in a PR, a Show HN / dev.to draft written in
  the honest voice, and a README final pass. Drafts live in the repo only if
  they meet the public-docs bar; otherwise summarize for the maintainer in
  conversation.
- **5.5 Docs site decision.** Recommendation: defer; the README plus docs/
  is enough until the feature surface stabilizes. Revisit at v1.0.
- **5.6 Pre-launch legal / trademark check (not legal advice; a to-do list).**
  Before a real launch push, de-risk the few areas where a free OSS security
  tool can draw a complaint: (1) trademark, search "vetguard" on USPTO TESS and
  EUIPO, note the existing veterinary/pet "VetGuard" marks are a different
  goods class but confirm no software-class conflict; do not use competitors'
  marks or logos. (2) Findings framing, keep every finding an evidenced risk
  signal for the person scanning ("resembles X, verify", "could not verify"),
  never a public verdict that a named vendor's package "is malware"; that
  opinion-plus-disclosed-facts framing is the main defamation guard. (3) The
  community bad-names list (5.2) and the comparison doc (5.1) are the two public
  surfaces that need neutral wording, a dispute/takedown path, and factual-only
  claims. (4) Confirm the Apache-2.0 warranty/liability disclaimer stays intact.
  (5) For a serious launch, a flat-fee "clear to launch" review with an IP/tech
  lawyer. Copyright exposure is near-zero (original code; the npm-high-impact
  corpus is MIT and attributed; name lists are facts).

## Milestone 6: v1.0

Ship v1.0 when all of the following hold, then maintain the moving `v1`
Action tag:

- Detector rule IDs, JSON schemaVersion, and SARIF shape frozen; semver
  policy documented (new detectors in minors, severity changes in release
  notes).
- known-cve, diff mode, baseline, config, yarn classic and pnpm lockfiles,
  and workspaces all shipped.
- The accuracy harness has run green on schedule for four consecutive weeks,
  and its numbers are published in release notes.
- No open P1 bugs; CONTRIBUTING reflects the real workflow; at least one
  external contribution has been merged (soft signal, not a blocker).

Post-v1 backlog (explicitly out of scope before v1): PyPI adapter (proves the
ecosystem-agnostic core), bun.lockb, community rule packs, watch mode, staged
npm publishing.

## Known limitations and follow-ups

Tracked gaps that are not yet scheduled into a milestone. Each is a real,
bounded piece of work, deliberately deferred with a reason (from the M2 audit,
`docs/AUDIT-M2-REMEDIATION.md`):

- **Unicode-confusable names (from F8).** Lookalike name detection normalizes
  via lowercase plus separator stripping only, not NFKC. A homoglyph typosquat
  (a Cyrillic character standing in for a visually identical Latin one) is
  neither normalized nor flagged. Fix is a dedicated detector change: NFKC (or
  a curated confusable map) normalization, homoglyph fixtures, and clean
  controls so legitimate non-ASCII names do not false-positive. Deferred off
  the polish batch because it is detection logic, not a test gap.
- **SHA-pin third-party GitHub Actions (from F10).** Workflows float major tags
  (`actions/checkout@v4`). Pinning to full commit SHAs with Dependabot updating
  them matches the supply-chain thesis. Deferred as ongoing hardening: it needs
  Dependabot config plus per-action SHA lookups, not a one-line change.

## Sequencing summary

| Order | Milestone                | Rough size    | Depends on          |
| ----- | ------------------------ | ------------- | ------------------- |
| 1     | M1 Frictionless adoption | 6 PRs         | nothing             |
| 2     | M2 Complete and correct  | 6 PRs         | M1.2 for diff paths |
| 3     | M3 Everywhere (reach)    | 7 PRs         | nothing hard        |
| 4     | M4 Backdoor depth        | 7 PRs         | M3.5 cache helps    |
| 5     | M5 Community and launch  | 5 PRs         | M1-M3 shipped       |
| 6     | M6 v1.0                  | 2 PRs + gates | all above           |

Items within a milestone are individually shippable PRs; do not batch. When a
session ends mid-milestone, update PROJECT-STATE.md status so the next
session resumes exactly.

## Risks to manage

- False-positive creep as detectors multiply: the evaluation harness (2.2) is
  the guardrail; land it before the behavioural detectors.
- Tarball pipeline is an attack surface: hostile-input tests are part of 4.1
  itself, not a follow-up.
- OSV and registry API limits on big trees: batching plus the disk cache
  (3.5); degrade to unverified, never guess.
- Scan-time growth: tiered depth (4.0) and the cache keep the default fast;
  measure and record scan times in PRs that touch collectors.
- Corpus and API drift: scheduled refresh (2.3) and the weekly evaluation
  run double as smoke tests.
- Solo-maintainer bandwidth: releases stay maintainer-gated; everything else
  is delegated and small.

## Open questions for the maintainer (non-blocking)

- Milestone 3 vs 4 order when that fork is reached (reach vs backdoor depth).
- Action PR comments default off (recommended) or on.
- Marketplace listing timing (needs a maintainer click).
- Whether the launch posts (5.4) should be drafted in-repo or only in
  conversation.
