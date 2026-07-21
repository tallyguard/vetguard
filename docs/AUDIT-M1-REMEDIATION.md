# Milestone 1 audit remediation

Tracking doc for the findings from the 2026-07-21 audit of Milestone 1 (the
seven PRs #4 to #10). One entry per finding, worked off individually on a
`type/slug` branch and PR per the CLAUDE.md per-change loop. Status is updated
in the same change that lands each fix. When every row is done and proven, this
doc records the closure and can be archived.

The plan below was adversarially verified before execution (2026-07-21). That
pass corrected several details: the diff-key wording in #5 was factually wrong;
#1/#2 needed a pinned `low` severity, a suppressed confidence bump, two tests
rewritten (not added), and a decision on online-transient behavior; #4 missed
`color.ts` and the stale ROADMAP markers; and #8 needed a specific parenthesized
jq or it would regress into posting duplicate comments. All are folded in here.

The version-pin finding (#3) is deferred by maintainer decision to the v0.2.0
release cycle: the README documents features that only exist on `main`, and the
pins can only become correct once 0.2.0 is published. Tracked for completeness,
out of scope this cycle.

## Status

| #   | Finding                                                       | Severity     | Fix type    | Status             |
| --- | ------------------------------------------------------------- | ------------ | ----------- | ------------------ |
| 1   | Self-scan does not block on findings; README overclaims       | Medium       | code + docs | Done (2026-07-21)  |
| 2   | Offline dogfood cannot detect; "gains teeth" comment is false | Low          | code + docs | Done (2026-07-21)  |
| 3   | README documents 0.2.0 features while pinned to 0.1.0         | Release-prep | docs        | Done (v0.2.0 prep) |
| 4   | PROJECT-STATE.md + ROADMAP.md stale records                   | Low          | docs        | Done (2026-07-21)  |
| 5   | DECISIONS.md missing the diff resolved-identity-key entry     | Low          | docs        | Done (2026-07-21)  |
| 6   | CLAUDE.md calls the CI dogfood "live"; it runs `--offline`    | Low          | docs        | Done (2026-07-21)  |
| 7   | Repo security settings disabled on a public security repo     | Info         | gh settings | Done (2026-07-21)  |
| 8   | Sticky-comment marker match is first-wins (redirectable)      | Low          | code        | Done (2026-07-21)  |

## Direction decided this cycle

- **#1/#2:** add offline-capable name detection so the self-scan has real teeth
  without a network round-trip, wire it so an introduced name-resemblance
  finding fails CI offline, and make the docs precisely true. Chosen over the
  doc-only softening because the goal is the strongest detection. Feasibility
  spike (2026-07-21): offline name-detection produces zero hits on vetguard's
  own 224 lockfile dependencies (135 non-scoped names are all corpus members and
  self-suppressed; 89 are scoped and skipped), so it introduces no false
  positives on the dogfood.
- **#3:** kept separate; the pins and broken examples are fixed when v0.2.0 is
  cut, not now.
- **#7:** applied by automation via `gh` (maintainer's choice), safe and
  reversible settings only.

## Execution order

Verified recommendation (each its own branch/PR unless noted):

1. This tracking doc (with the corrected #5 wording).
2. #6 CLAUDE.md wording. Pure text, zero code risk.
3. #4 PROJECT-STATE.md and ROADMAP.md staleness, one doc-currency branch.
4. #5 DECISIONS.md diff-key entry (corrected wording).
5. #8 sticky-comment hardening (action.yml and pr-scan.yml together).
6. #1/#2 the detector change, last among code, only after the decision table is
   locked. Its README and test-comment edits land in the same PR because they
   describe behavior that PR introduces.
7. #7 repo settings via `gh`, orthogonal, applied out of band.

## Findings and plans

### 1. Self-scan enforcement and honest docs (Medium)

**Problem.** README ("Is vetguard itself safe?") claims "a finding in its own
supply chain fails its own build." It does not: the dogfood unit test and the CI
gate both run `--offline`, and offline every registry lookup is `unverified` so
`existsOnRegistry` is `undefined`; all six detectors early-return on unknown
existence. The PR self-scan is live but ends every step with `|| true` and is not
a required check. So a real finding would surface but fail nothing.

**Fix.** Make the name detectors offline-capable (see #2), so an introduced
name-resemblance finding is caught offline and fails the offline CI gate via the
existing non-zero exit on findings (`ci.yml` runs `scan . --offline` with no
`--fail-on`, so any finding, including `low`, exits 1). Correct the README bullet
and the test comment to state exactly what is true.

**Scope of the claim (state precisely, do not overclaim).** Offline the self-scan
catches only name-RESEMBLANCE findings: an edit-distance-1 near-miss or a
token-recombination of a top-ranked corpus name. It does NOT catch a genuinely
nonexistent non-resembling name (nonexistent-package needs a live 404) nor a
novel-token blend. The README bullet and the `tests/dogfood/self-scan.test.ts`
comment must say "introduced name-resemblance findings," not imply all bad names
are caught offline. These doc edits land IN the #1/#2 PR.

**Proof.** A unit fixture with an introduced look-alike name fires offline at
`low`; the real offline self-scan stays clean (spike-backed); full gate green.

### 2. Offline-capable name detection (Low, folds into #1)

**Problem.** `tests/dogfood/self-scan.test.ts` runs offline and its comment
claims it "gains teeth automatically" as offline-capable detectors land, but
typosquat and hallucination-name both gate on `existsOnRegistry !== undefined`,
so no detector can fire offline; the comment is aspirational.

**Mechanism.** Add an optional `PackageFacts` field recording why existence is
unknown, set by the collector: `existenceUnverifiedReason?: "offline" | "error"`.
`enrich.ts` sets it on the `unverified` path (`"offline"` when the registry
client reports offline, `"error"` otherwise). This is a small, in-layer collector
change (collector sets facts, detector reads them), and it is what lets the
detector fire only on deliberate offline, never on a transient online failure.

**Decision table for the new branch** (identical in `typosquat.ts` and
`hallucination-name.ts`, gates top-down, existing order preserved):

1. `source !== "registry"` -> `[]` (unchanged).
2. `name.startsWith("@")` -> `[]` (unchanged; scopes are ownership-gated).
3. `corpus.has(name)` -> `[]` (self-membership; pure, offline-safe; this is what
   keeps the dogfood green, all 224 deps hit it).
4. compute `match`; if none -> `[]`.
5. `existsOnRegistry === false` -> high/high (unchanged; unreachable offline).
6. `existsOnRegistry === true` -> existing online tiering (unchanged).
7. NEW: `existsOnRegistry === undefined` AND `existenceUnverifiedReason ===
"offline"` AND `match` present -> severity `low`, confidence `low`, evidence =
   existing resemblance text + "; existence and adoption unverified (offline
   scan)". For typosquat, do NOT apply the `CONFIDENT_TRANSFORMS` bump on this
   branch (return before it, or guard the bump with `existsOnRegistry !==
undefined`). When the reason is `"error"` (transient online failure), stay
   silent as today.

**Why `low`/`low`.** Offline the branch has zero corroborating facts
(`existsOnRegistry`, `ageDays`, `weeklyDownloads` all undefined). `low` severity
also keeps `--fail-on medium` and `--fail-on high` consumers unaffected while
still exiting 1 under the default no-threshold gate that `ci.yml` relies on.
`"non-critical"` was too loose (would permit `medium`, which trips `--fail-on
medium`).

**Tests.** REWRITE (not add) `typosquat.test.ts:57-59` and
`hallucination-name.test.ts:55-59` (currently assert `toHaveLength(0)` for
`existsOnRegistry: undefined`; after the change `expres`/`unused-imports` fire).
They must now assert exactly one finding at `severity==="low"`,
`confidence==="low"` with the unverified-evidence note. Add: (a) an introduced
resembling name fires `low` offline (state which transform, to exercise the
no-bump path); (b) a transient-error unknown-existence stays silent (locks in no
online regression); (c) offline self-scan stays clean. Default tests stay
network-free.

**DECISIONS.md entry** records: the offline decision table; that a transient
online error stays silent (reason-threaded, so no rate-limit FP); and the
dogfood-fragility note (the offline scan is clean because all current deps are
corpus members; adding a future non-corpus dep that resembles a top-ranked corpus
name will fire `low` and turn the offline CI dogfood red, which is intended and
resolved with a config `ignore` carrying a reason).

### 3. Version pins document unreleased features (Release-prep, deferred)

The published `npx vetguard` / `@v0.1.0` fetch 0.1.0, which has only `scan` and
`check` and no `comment` input, but the README documents diff, baseline, config,
`--markdown`, `--quiet`, `--no-color`, and `comment: true`. Two examples break
against the pinned version (README `173` `npx vetguard@0.1.0 diff` errors; README
`132`-`135` `comment: true` on `@v0.1.0` is a silent no-op). Resolved by cutting
v0.2.0: bump `package.json`, repin the Action and `npx` examples to `@v0.2.0`,
update RELEASING. Owner cuts the GitHub Release (maintainer-gated). Lines: README
`8`, `132`, `147`-`148`, `173`; RELEASING `27`-`28`.

### 4. PROJECT-STATE.md and ROADMAP.md stale records (Low)

`docs/PROJECT-STATE.md:110` says "Lockfile/tarball collectors land next", but the
lockfile collector is done and in use; only the tarball collector is future
(M4.1). The same structure block omits `lockfile.ts` (npm list, lines 105-110)
and `color.ts` (`src/output/` list, lines 117-119, a shipped M1.5 module imported
by `terminal.ts`). Line `13` lists the CLI as `scan / check / diff` and omits the
shipped `baseline` command. Fix these and refresh the "Last verified" line.

`docs/ROADMAP.md`: line `17` says "103 tests" (actual 143); either update it or
label it explicitly the v0.1.0 starting-point snapshot. Items `1.1`/`1.2`/`1.3`
(and the "## Milestone 1" header) lack the "(DONE)" marker that `1.4`-`1.7` carry,
contradicting PROJECT-STATE's "Milestone 1 complete". Mark them done. Fold into
the same doc-currency branch as the PROJECT-STATE fixes.

### 5. DECISIONS.md missing the diff-key entry (Low)

`src/core/diff.ts` keys introduced dependencies on `name@version#origin`, where
`origin = integrity ?? resolvedUrl ?? source`. The resolved-origin suffix is what
makes a same-version lockfile repoint visible: a repoint keeps `name@version` but
swaps `integrity`/`resolvedUrl`, so a plain `name@version` key would report
nothing changed (the HIGH bug the M1.2 review caught). There is no decision-log
entry, so a future refactor could drop the suffix and silently revert it. Append
an entry with that rationale and the rejected plain-`name@version` alternative.
(The key includes `name@version`; it is not keyed instead of it.)

### 6. CLAUDE.md CI-dogfood wording (Low)

CLAUDE.md section 3 (~lines 86-87) and section 7 (~line 250) describe the CI
dogfood as a live `node dist/cli.js scan .`, but `.github/workflows/ci.yml:31`
runs `scan . --offline`; the only live (non-blocking) scan is in `pr-scan.yml`
(`scan . --sarif` and `scan . --markdown`, each ending `|| true`). Correct the
wording in both sections.

### 7. Repo security settings (Info)

On the public repo: secret scanning and push protection disabled, Dependabot
security updates off, `delete_branch_on_merge` false, all three merge methods
allowed. Exact commands (token has admin; all reversible):

- One PATCH via `--input` JSON body (nested `security_and_analysis` is not
  expressible as flat fields; keep `allow_squash_merge: true` or GitHub rejects a
  PATCH that disables all three merge methods):
  `{ delete_branch_on_merge: true, allow_squash_merge: true, allow_merge_commit:
false, allow_rebase_merge: false, security_and_analysis: { secret_scanning: {
status: "enabled" }, secret_scanning_push_protection: { status: "enabled" } } }`.
  If push-protection ordering errors, split into two PATCHes (secret scanning
  first, then push protection; push protection requires secret scanning on).
- Dependabot is two PUT calls, alerts before security updates:
  `gh api --method PUT repos/tallyguard/vetguard/vulnerability-alerts` then
  `gh api --method PUT repos/tallyguard/vetguard/automated-security-fixes`.

`enforce_admins=false` stays (documented: a solo owner cannot approve their own
PRs).

### 8. Sticky-comment marker match (Low)

`action.yml:60` and `.github/workflows/pr-scan.yml:36` select the first comment
containing `<!-- vetguard-report -->`. A PR author could pre-seed a marker comment
to redirect the in-place update. Harden BOTH with the exact expression (inner
parens around the `.body` pipe are mandatory, or `|` binds looser than `and`, jq
errors, the error is swallowed by `2>/dev/null || true`, and it posts a new
comment every run, a duplicate-comment regression):

`map(select((.body | contains("<!-- vetguard-report -->")) and .user.login ==
"github-actions[bot]")) | .[0].id // empty`

The built-in `GITHUB_TOKEN` posts as `github-actions[bot]` (a reserved,
unspoofable login). First-post case is preserved (empty result -> POST). Add a
one-line note that this predicate is correct only while the token is the built-in
`github.token`; a future PAT or App token would post under a different login.

## Notes

- The #1/#2 detector change alters detection semantics, so it lands with a
  DECISIONS.md entry and is the item most in need of maintainer review before
  merge (the human is the done-gatekeeper).
- The README "Is vetguard itself safe?" bullet and the self-scan test comment can
  only be truthfully written after #1/#2 lands; they stay in that PR, never as
  standalone doc edits ahead of the detector.
