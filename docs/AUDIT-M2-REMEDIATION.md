# Milestone 2 audit: findings and remediation plan

Date: 2026-07-22. Scope: full audit of the repo after M2.1-M2.4 (known-cve,
accuracy harness, corpus refresh, scoped-lookalike), including PR #26 (held,
unmerged) and everything on main. Method: full local gate run, empirical
repro of every crash claim, three independent code sweeps (detectors and
tests, workflows and release consistency, hostile-input safety), and live
checks against the GitHub repo (branch protection, workflow runs, PR state).

Status legend: OPEN until fixed and proven; each fix follows the per-change
loop in CLAUDE.md (one branch per finding or per tight group, tests included,
gate green).

## What is confirmed correct (verified, not asserted)

- Full gate green locally on the PR #26 branch: typecheck, lint,
  format:check, 195/195 tests, build, offline dogfood scan (exit 0,
  verdict could-not-verify with zero findings). PR #26 checks green.
- All 8 detectors exist, are registered in `src/core/rules/index.ts`, are
  pure (no IO), emit stable ruleIds matching docs, and each has firing and
  non-firing unit tests.
- known-cve respects the architecture: OSV lookups live in the collector
  (`osv.ts` folded in by `enrich.ts`); the detector reads
  `pkg.knownVulnerabilities` only.
- Degrade-honestly machinery is correct end to end: registry, downloads and
  OSV failures thread reasons into `unverified`, `decideVerdict` never
  returns clean for a partially verified scan, and a range-version package
  is marked unverified rather than silently skipped.
- No code path executes, requires, or evals scanned-package code (swept for
  child_process, dynamic import, eval, new Function, node:vm, createRequire).
- `scripts/evaluate.ts` is genuinely offline and deterministic; it gates
  ci.yml, evaluate.yml (weekly) and release.yml.
- refresh-corpus change detection proven in five empirical cases:
  timestamp-only restamp produces no PR; a name change, a count change, and
  an added name containing the substring "generatedAt" all produce a PR; a
  no-op diff produces no PR.
- Version story consistent at 0.2.0 (package.json, README pins,
  PROJECT-STATE), except finding F4 below.
- DECISIONS.md and ROADMAP.md changes on the PR #26 branch match the
  workflow as implemented.

## Findings

### F1. Hostile package.json / package-lock.json crashes the scan (HIGH, stop-the-line)

**Status: FIXED (2026-07-22).** `manifest.ts` and `lockfile.ts` now guard the
parsed document and every field: a non-object manifest or a malformed
dependencies block fails with a clear message (not a crash or a silent clean); a
non-string version becomes an unverifiable fact (could-not-verify); a null
document, packages-as-array, null lockfile entry, and non-string version/resolved
are handled without a TypeError. All repro cases verified degrading, and tests
were added for each shape (see F8). Deviation from the plan's "always
could-not-verify": a wholly-unreadable/malformed manifest fails with exit 2 (the
documented read-error code that fails loud in CI), while partial malformation
degrades to could-not-verify.

CLAUDE.md treats scanned packages as hostile input and hostile-input failures
as stop-the-line. Four crash cases were reproduced against the built CLI
(`node dist/cli.js scan <dir> --offline`), each exiting 2 with an uncaught
TypeError instead of degrading:

- package.json containing literal `null`: `Cannot read properties of null
(reading 'dependencies')` at `src/ecosystems/npm/manifest.ts` (the try
  block wraps only `JSON.parse`; `raw.dependencies` runs unguarded).
- A dependency whose version value is not a string
  (`{"dependencies":{"foo":null}}`): `Cannot read properties of null
(reading 'startsWith')` in `classifySource`.
- package-lock.json containing literal `null`: `Cannot read properties of
null (reading 'lockfileVersion')` at `src/ecosystems/npm/lockfile.ts`.
- A lockfile `packages` entry whose value is `null`: `Cannot read
properties of null (reading 'version')` in the lockfile entry loop.

Related non-crash defect: `{"dependencies":["a","b"]}` (array) silently
produces junk facts named "0" and "1" (verified: they appear in the
could-not-verify list), which is dishonest degradation.

Exit 2 is also the generic error code, so CI consumers cannot tell a hostile
input from a scanner bug.

Resolution steps:

1. In `manifest.ts`: after `JSON.parse`, require the result to be a non-null
   plain object, else return the "unreadable manifest" path that already
   exists for parse failures. In the dependency loop, skip any deps block
   that is not a plain object (arrays included) and any entry whose name or
   spec is not a string; count each skip as an unverifiable fact (thread a
   reason) rather than dropping it silently.
2. In `lockfile.ts`: after `JSON.parse`, require a non-null plain object,
   else return the existing `unsupported` result. In the packages loop,
   skip entries whose value is not a non-null object.
3. Add unit tests for every shape above: null document, array dependencies,
   null/number/object version spec, null lockfile entry, packages-as-array.
   `readManifestFacts` currently has zero tests (only `classifySource` is
   tested); cover it directly.
4. Prove with the repro commands above that all five cases now produce a
   report (could-not-verify where facts are missing), not a stack trace.

### F2. The refresh-corpus auto-created PR will not run the CI gate (HIGH, defeats the feature's stated promise)

**Status: FIXED (2026-07-22).** Adopted option 1: `refresh-corpus.yml` no longer
calls `gh pr create`. It pushes a branch and prints a compare link; a maintainer
opens the PR from the link, which runs the full gate. The DECISIONS entry,
ROADMAP 2.3, PROJECT-STATE, and the workflow comment now state this and drop the
org-setting recommendation. (Prior PR #26 was closed and superseded.)

GitHub does not create workflow runs for events triggered with the built-in
`GITHUB_TOKEN` (documented anti-recursion rule; only workflow_dispatch and
repository_dispatch are exempt). `refresh-corpus.yml` pushes the branch and
runs `gh pr create` with `GH_TOKEN: ${{ github.token }}`. Consequence: if
the org setting "Allow GitHub Actions to create and approve pull requests"
is enabled (the currently recommended fix for the 409), the auto-created PR
will trigger neither the push nor the pull_request workflows. main requires
the `gate (20)` and `gate (22)` checks (verified via the branch protection
API), so the refresh PR would sit unmergeable with checks stuck on
"Expected", and the claim "the refresh PR flows through the full gate
including the accuracy eval" would be false for the automated path.

Note the inversion: the current fallback (a human opens the PR from the
printed compare link) is the path that DOES trigger CI, because the PR
creation event is actor-attributed to the human.

Resolution options, in order of fit with the no-stored-secrets stance:

1. Make the compare-link flow the designed path, not a fallback: the
   workflow pushes the branch and prints the link; the maintainer clicks it
   to open the PR (CI then runs normally). Update the workflow comment,
   DECISIONS.md entry, ROADMAP 2.3 wording and PROJECT-STATE to say this
   plainly, and drop the recommendation to flip the org setting (flipping it
   alone produces stuck PRs).
2. If fully automated PRs are wanted later: create an org-owned GitHub App
   with contents:write and pull-requests:write on this repo, mint an
   installation token in the workflow (`actions/create-github-app-token`),
   and use it for the push and `gh pr create`. App keys are org-managed and
   scoped, unlike a PAT; record the decision in DECISIONS.md.
3. Not acceptable: direct-push to main, a personal PAT secret.

Whichever option is chosen, prove it live: merge #26, `gh workflow run
"Refresh popular-package corpus"`, and confirm either a PR whose gate runs,
or a pushed branch plus link. Record the result in PROJECT-STATE.

### F3. The GitHub Action runs vetguard@latest even when the action tag is pinned (HIGH, consumer trust)

`action.yml` input `version` defaults to `latest` and the steps run
`npx --yes vetguard@${VETGUARD_VERSION}`. The README example is
`uses: tallyguard/vetguard@v0.2.0` with no `version:` input, and
README/RELEASING explicitly tell users to pin an exact release because 0.x
minors may change behaviour. A consumer following the README pins the
action wrapper but still executes whatever `latest` is on npm. The pinning
promise is not kept.

Resolution steps:

1. Change the `version` input default in `action.yml` from `latest` to the
   current release version (e.g. `0.2.0`, or `0.3.0` when that ships).
2. Add a release-checklist step in `docs/RELEASING.md`: bump the
   `action.yml` version default in the same release PR that bumps
   package.json, so the tag `vX.Y.Z` carries an action that runs vetguard
   X.Y.Z by default.
3. Optionally note in the README that `version:` can override.
4. Test: in a scratch workflow (or by reading the composite steps), confirm
   the resolved `pkg` string is `vetguard@0.2.0` when the input is omitted.

### F4. README says "Six detectors"; eight are live (MEDIUM, doc accuracy)

README.md line 8 says "Six detectors"; the README's own "Live today" list
and the code both have eight (scoped-lookalike and known-cve are newer).
Fix the count. Natural home: the v0.3.0 release PR that already plans to
update the detector list, pins and changelog. If the release is deferred,
fix the line on its own docs branch; a public README overstating or
understating detection is exactly the "stale record" CLAUDE.md forbids.

### F5. pr-scan.yml masks scanner crashes and has a sticky-comment race (MEDIUM)

**Status: FIXED (2026-07-22).** Both scan steps now capture the exit code (via
`PIPESTATUS` for the piped one) and `exit "$code"` when it is >= 2, so a scanner
crash fails the step while findings (exit 1) are still tolerated. A `concurrency`
group keyed on the PR number with `cancel-in-progress` prevents interleaved
sticky-comment posts.

Two defects in `.github/workflows/pr-scan.yml`:

- The scan steps append `|| true` without inspecting the exit code
  (`node dist/cli.js scan . --sarif > vetguard.sarif || true` and the
  markdown step). The intent is to tolerate exit 1 (findings) since this
  workflow is informational, but it also swallows exit 2 (crash), so a
  broken build or scanner exception yields a green step with an empty
  report. The composite `action.yml` gets this right by capturing
  `${PIPESTATUS[0]}`. Fix: capture the code and
  `if [ "$code" -ge 2 ]; then exit "$code"; fi`.
- No `concurrency` group: two rapid pushes to a PR can interleave the
  find-then-create sticky-comment logic and post duplicate comments. Fix:
  `concurrency: { group: pr-scan-${{ github.event.pull_request.number }},
cancel-in-progress: true }`.

Test by pointing the scan step at a deliberately broken entry locally
(simulate exit 2) and confirming the step fails; the concurrency guard is
config-only.

### F6. Scheduled workflows can be silently auto-disabled after 60 days of repo inactivity (MEDIUM, operational)

GitHub disables cron schedules in repos with no commit activity for 60
days; scheduled runs themselves do not reset the clock, and a refresh run
that opens no PR creates no activity either. Both `evaluate.yml` (weekly
accuracy eval) and `refresh-corpus.yml` (monthly refresh) depend on cron.
The mechanism built to prevent corpus staleness is itself vulnerable to
going quiet exactly when the repo goes quiet.

Resolution: pick one and record it in DECISIONS.md.

1. Accept and document: add a line to PROJECT-STATE known caveats and to
   RELEASING.md that a 60-day-quiet repo needs its schedules re-enabled
   (Actions tab shows a banner; `gh workflow enable` restores them).
2. Or add a keepalive step to one scheduled workflow (e.g. the workflow
   re-enables itself via `gh workflow enable` on each run, or use a
   maintained keepalive action). Weigh against the no-noise principle.

### F7. No size caps on file reads or network bodies (LOW, hardening)

`manifest.ts`, `lockfile.ts`, `config.ts` and `baseline-io.ts` read files
with no size guard; `registry.ts`, `downloads.ts` and `osv.ts` call
`res.json()` unbounded. A scanned tree is hostile input, and all three
clients accept a caller-supplied URL, so a multi-GB body can OOM the
scanner. CLAUDE.md requires archive/tarball reads to be size-capped; the
same principle applies here.

Resolution: stat before read with a generous cap (for example 5 MB for
package.json, 200 MB for package-lock.json; oversize degrades to
could-not-verify with a reason), and check Content-Length or stream with a
byte cap before parsing network bodies. Add tests with an oversize fixture
generated at test time (do not commit a large file).

### F8. Missing hostile-input and unicode tests (LOW, follows F1)

**Status: PARTIALLY FIXED (2026-07-22).** The hostile-input tests are done:
`readManifestFacts` is now covered directly (valid deps, null/array document,
malformed dependencies block, non-string version, missing file), and lockfile
hostile shapes (null document, packages-as-array, null entry, non-string
version/resolved) are covered. The unicode-confusable item below is still OPEN.

- `readManifestFacts` has no tests at all (see F1 step 3).
- Lockfile hostile shapes (null entry, packages-as-array, non-string
  version) are untested.
- No unicode-confusable name test anywhere; `src/util/names.ts` normalizes
  only via toLowerCase plus separator stripping, no NFC/NFKC. A confusable
  typosquat (Cyrillic homoglyph) is neither normalized nor detected. Adding
  NFKC normalization plus a homoglyph test case is a small, real detection
  win; if deferred, record it as a known limitation in ROADMAP instead.

### F9. Milestone done-criteria not yet demonstrated live (LOW, process honesty)

- ROADMAP 2.2 is "done when the workflow runs green on a schedule";
  `evaluate.yml` ("Accuracy evaluation") is registered but has zero runs
  (cron has not fired since it landed; never dispatched). Run
  `gh workflow run "Accuracy evaluation"` once and confirm green.
- ROADMAP 2.3 (marked DONE on the PR #26 branch) is "done when a scheduled
  run produces a mergeable PR with only data changes"; no live run has
  happened (the workflow only registers after merge) and the automated-PR
  path is blocked (see F2). After merging #26 and resolving F2, dispatch
  once and record the observed result in PROJECT-STATE.

### F10. Minor polish (LOW, batchable as one cleanup branch where sensible)

- `nonexistent-package` findings carry no `evidence` field (detail prose
  only); `unpublished-version` attaches evidence only when a version is
  present. Add a concrete evidence string to the former for consistency
  with the "every finding carries evidence" rule.
- `release.yml` runs typecheck, lint, test, build, evaluate but not
  `format:check`; the release gate is a subset of the CI gate. Add it.
- Third-party actions float major tags (`actions/checkout@v4` etc.). For a
  supply-chain tool, SHA-pinning them (with Dependabot updating the pins)
  matches the product thesis. Hardening, not a bug.
- ci.yml and release.yml have no concurrency groups (wasted parallel runs;
  publishes are not serialized). Low risk, cheap fix.
- refresh-corpus opens a PR for a metadata-only change (npm-high-impact
  version bump with an identical name list changes `sourceVersion`), which
  contradicts the "only when the name list changes" wording. Either accept
  and reword the docs, or extend the filter to sourceVersion lines.
- refresh-corpus does not check for an already-open refresh PR; two quiet
  months with an unmerged refresh PR produce a second PR. Optional: skip
  when an open PR titled "Refresh popular-package corpus" exists.
- The `grep -v 'generatedAt'` filter is substring-based; anchor it to the
  metadata line (`grep -vE '^[+-] *generatedAt:'`) to remove the
  theoretical case where both sides of a changed names line contain that
  substring. Proven safe today; this is belt-and-braces.

## Suggested order of work

1. F1 + F8 manifest/lockfile guards and tests (stop-the-line, one branch).
2. F2 decision + doc corrections, then merge #26 and do the live dispatch
   proof (also closes the 2.3 half of F9).
3. F3 action version default (small, high consumer impact); fold into or
   land just before the v0.3.0 release PR, which also fixes F4.
4. F5 pr-scan hardening. Then F6 decision, F7, F9 (2.2 dispatch), F10.

Each fix updates this file (mark the finding fixed with date and PR) and
any doc it invalidates, per CLAUDE.md section 5.
