# vetguard

A free, open-source, local-first scanner for the npm supply-chain threats that
AI-assisted development created: hallucinated (slopsquatted) dependencies,
typosquats, and freshly registered malicious packages. No account, no server,
no telemetry.

> `vetguard@0.3.0` is on npm, published with provenance. Eight detectors,
> full-tree `package-lock` scanning, diff mode, a config file and baseline for
> brownfield adoption, and a GitHub Action with text/JSON/SARIF/markdown output.
> Roadmap to v1.0: [docs/ROADMAP.md](docs/ROADMAP.md).

## Why

Standard scanners answer "does this dependency have a known CVE?". That misses
the attacks AI coding assistants opened up: an assistant suggests a package
name that does not exist, an attacker registers it, and the next assistant
installs it. A freshly registered malicious package has no advisory history, so
CVE-first tools cannot see it. vetguard targets that gap.

## Install

Published on npm. Run it without installing:

```
npx vetguard scan          # scan the current project
npx vetguard check <pkg>   # vet a package before installing
```

Or add it to a project with `npm install --save-dev vetguard`. Requires Node.js
20 or newer.

## Usage

```
vetguard scan [dir]     Scan a project's dependencies (defaults to cwd)
vetguard check <pkg>    Vet a single package before installing
                        (e.g. vetguard check some-package, foo@1.2.3)
vetguard diff --base <lockfile> [--head <lockfile>]
                        Scan only the dependencies a change introduces
                        (head defaults to ./package-lock.json)
vetguard baseline [dir] Record current findings so later scans fail only on new
                        ones (adopt on an existing project, ratchet down later)
vetguard --help         Show help
vetguard --version      Show version

  --offline             Do not contact the registry
  --json                Print the report as JSON (for CI and tooling)
  --sarif               Print SARIF 2.1.0 for GitHub code scanning
  --markdown            Print compact markdown for a PR comment or summary
  --quiet               Print only findings and the verdict
  --no-color            Disable ANSI colors (also respects NO_COLOR)
  --fail-on <severity>  Exit non-zero only at or above this severity
                        (critical|high|medium|low|info); default: any finding
```

Text output is colored by severity only when writing to a terminal; piped or
redirected output stays plain, and `--no-color` or the `NO_COLOR` environment
variable turns color off.

`scan` reads the resolved dependency tree from `package-lock.json` (v2 or v3),
so it covers transitive dependencies and exact installed versions. Without a
supported lockfile it falls back to the manifest's declared dependencies and
says so; yarn and pnpm lockfiles are detected and reported as not yet supported
rather than silently skipped.

Exit codes: `0` clean or could-not-verify, `1` findings, `2` usage or read
error. `check` makes vetguard usable as a pre-install gate, including for
coding agents that add dependencies.

## Configuration

An optional `vetguard.config.json` in the scanned project sets defaults and
suppresses findings. Command-line flags override it.

```json
{
  "failOn": "high",
  "offline": false,
  "ignore": [
    {
      "rule": "young-package",
      "package": "our-internal-lib",
      "reason": "first-party package published last week; reviewed"
    }
  ]
}
```

Every `ignore` entry requires a `reason`, an ignore without one is a
configuration error, not a silent skip. A suppressed finding is still shown in
the report (marked suppressed, with its reason) but does not affect the verdict
or exit code. The point is an audit trail: you can always see what was waved
through and why.

### Adopt on an existing project (baseline)

A repository that has not been scanned before will usually have some
pre-existing findings. Rather than fix them all before you can turn vetguard on,
record a baseline and ratchet down over time:

```
vetguard baseline        # writes .vetguard-baseline.json (commit it)
```

Later scans report the baselined findings as suppressed and pass; only findings
**not** in the baseline fail the build. Commit the file so the whole team shares
the same starting line, then shrink it as you clean things up. A finding's
identity in the baseline includes its exact version, so a dependency bump is
re-evaluated rather than grandfathered forever.

## Use on pull requests

vetguard runs in GitHub Actions with no server and no cost: the scan happens on
GitHub's runners (free on public repositories), posts results through the
built-in `GITHUB_TOKEN`, and uploads SARIF so findings show up as PR annotations
and in the Security tab.

```yaml
# .github/workflows/dependency-scan.yml
name: Dependency scan
on:
  pull_request:
permissions:
  contents: read
  security-events: write # upload SARIF
  pull-requests: write # only if comment: true
jobs:
  vetguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tallyguard/vetguard@v0.3.0
        with:
          fail-on: high # fail the check only on high/critical findings
          comment: true # post/update a single sticky PR comment (optional)
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: vetguard.sarif
```

`comment: true` posts one sticky comment and updates it in place on later
pushes, so it never stacks. It needs `pull-requests: write`; leave it off (the
default) to rely on the SARIF annotations and job summary alone. On pull requests
from forks the token is read-only, so the comment is skipped without failing.

> Pin the action to an exact release (`@v0.3.0`) while vetguard is pre-1.0, since
> 0.x minor versions may change behaviour; a moving `@v1` tag will follow the
> 1.0 release. Each tag runs the matching vetguard version by default (override
> with the `version:` input). This repository also scans its own pull requests
> from source via
> [.github/workflows/pr-scan.yml](.github/workflows/pr-scan.yml).

### Scan only what a pull request changes

`diff` mode evaluates just the dependencies a change introduces (new to the head
lockfile, or a new version), which is the highest-signal moment and keeps the
report focused. Fetch the base branch's lockfile and diff against the working
tree:

```yaml
name: Dependency diff
on:
  pull_request:
permissions:
  contents: read
jobs:
  vetguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0 # so the base branch's lockfile is available
      - run: git show "origin/${{ github.base_ref }}:package-lock.json" > /tmp/base-lock.json
      - run: npx vetguard@0.3.0 diff --base /tmp/base-lock.json --fail-on high
```

## What it checks

Every finding carries a rule id, severity, and concrete evidence, so a verdict
is always traceable to why. Live today:

- **nonexistent-package**: a dependency name with no record on the registry,
  the clearest hallucination signal, before an attacker registers it.
- **young-package**: a recently first-published name with low or unknown
  adoption, the profile of a fresh registration standing in for a hallucinated
  or look-alike name.
- **install-scripts**: a package that runs a `preinstall`/`install`/
  `postinstall` script (the classic backdoor execution vector) and is not
  widely established. Popular packages that legitimately build native code are
  not flagged; a fresh or obscure package running install code is.
- **unpublished-version**: the package exists but the exact pinned version is
  not on the registry. Versions vanish when npm removes malware, so a pin the
  registry no longer serves is a strong tamper signal.
- **typosquat**: the name is a near-miss of a popular package (a single edit,
  transposition, or separator swap away). A popular package is never flagged as
  a squat of another, and an established look-alike is left alone; the signal
  only becomes a finding on a nonexistent, young, or low-adoption package.
- **hallucination-name**: the name recombines the tokens of a popular package,
  the slopsquat pattern where an AI reorders tokens or drops a convention prefix
  (`unused-imports` for `eslint-plugin-unused-imports`). Same risk gating as
  typosquat, so established packages that merely share tokens are not flagged.
- **scoped-lookalike**: an unscoped name that resembles a popular scoped package
  (bare `babel-core` for `@babel/core`), the dropped-scope typo attackers
  register. Same risk gating as typosquat, so a real established unscoped package
  is left alone; `@types` is allowlisted.
- **known-cve**: the resolved version has a known advisory (CVE/GHSA) in the
  OSV.dev database. vetguard checks each exact `name@version` against OSV,
  batched and cached, and maps severity from the advisory. `--offline` disables
  it, and any lookup failure (or a scan with no resolved versions) degrades to
  "could not verify", never a false "clean".

### On backdoors

vetguard targets backdoor _behaviours_: install-time code execution today, and
capability signals (unexpected network, filesystem, and process access),
obfuscation, and prompt injection aimed at coding agents next. No static
scanner can prove a package is free of backdoors, a novel or heavily obfuscated
one can evade heuristics, so vetguard raises evidenced signals and reports "no
findings", never "safe".

## Is vetguard itself safe?

A fair question to ask of any security tool, a scanner is exactly what a
supply-chain attacker would want to disguise malware as. Every claim below is
verifiable, not asserted:

- **Provenance-signed releases.** Every version is published from CI with npm
  provenance: cryptographic proof the published bytes were built from this
  public repository's tagged source, not tampered with in between. Verify with
  `npm audit signatures` after install, or the verified badge on the
  [npm page](https://www.npmjs.com/package/vetguard).
- **Zero runtime dependencies.** vetguard installs nothing but itself, so there
  is no transitive package that could be compromised, and every line that runs
  is code you can read. Verify: `npm view vetguard dependencies` (empty).
- **No install scripts.** `npm install vetguard` executes no code, there are no
  `preinstall` / `install` / `postinstall` hooks. Verify: read its
  `package.json`.
- **Never executes the code it scans.** It reads manifests, lockfiles, and
  package metadata as data; it never `require`s, imports, or evals a scanned
  package.
- **No telemetry, no phone-home.** The only network calls are the registry
  lookups a scan needs, and `--offline` disables even those. Verify: run any
  command with `--offline` and watch it work with no network.
- **Honest verdicts.** When something cannot be verified (offline, off-registry
  source, unsupported lockfile), vetguard reports "could not verify", never
  "safe".
- **Small, auditable, open source.** The published tarball is a handful of files
  (the bundled CLI, type declarations, `LICENSE`, `README`, `package.json`),
  built from the source in this repository under Apache-2.0.
- **It scans itself.** On every test run and in CI, vetguard scans its own
  dependencies offline: an introduced name that resembles a popular package (a
  typosquat or slopsquat) is caught with no network and fails the build. The
  pull-request workflow
  ([.github/workflows/pr-scan.yml](.github/workflows/pr-scan.yml)) also runs a
  full live scan for the signals that need the registry. Its own supply chain is
  held to the same bar it applies to yours.

## Development

```
npm install
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
```

Requires Node >= 20 (see `.nvmrc`). Contributing guide:
[CONTRIBUTING.md](CONTRIBUTING.md). Security policy:
[SECURITY.md](SECURITY.md). Design docs: [docs/](docs/).

## License

Apache-2.0. See [LICENSE](LICENSE).
