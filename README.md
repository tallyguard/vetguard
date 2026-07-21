# vetguard

A free, open-source, local-first scanner for the npm supply-chain threats that
AI-assisted development created: hallucinated (slopsquatted) dependencies,
typosquats, and freshly registered malicious packages. No account, no server,
no telemetry.

> `vetguard@0.1.0` is on npm, published with provenance. Six detectors,
> full-tree `package-lock` scanning, a GitHub Action, and text/JSON/SARIF
> output. Roadmap to v1.0: [docs/ROADMAP.md](docs/ROADMAP.md).

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
vetguard --help         Show help
vetguard --version      Show version

  --offline             Do not contact the registry
  --json                Print the report as JSON (for CI and tooling)
  --sarif               Print SARIF 2.1.0 for GitHub code scanning
  --fail-on <severity>  Exit non-zero only at or above this severity
                        (critical|high|medium|low|info); default: any finding
```

`scan` reads the resolved dependency tree from `package-lock.json` (v2 or v3),
so it covers transitive dependencies and exact installed versions. Without a
supported lockfile it falls back to the manifest's declared dependencies and
says so; yarn and pnpm lockfiles are detected and reported as not yet supported
rather than silently skipped.

Exit codes: `0` clean or could-not-verify, `1` findings, `2` usage or read
error. `check` makes vetguard usable as a pre-install gate, including for
coding agents that add dependencies.

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
  security-events: write
jobs:
  vetguard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: tallyguard/vetguard@v0.1.0
        with:
          fail-on: high # fail the check only on high/critical findings
      - if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: vetguard.sarif
```

> Pin the action to an exact release (`@v0.1.0`) while vetguard is pre-1.0, since
> 0.x minor versions may change behaviour; a moving `@v1` tag will follow the
> 1.0 release. This repository also scans its own pull requests from source via
> [.github/workflows/pr-scan.yml](.github/workflows/pr-scan.yml).

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

### On backdoors

vetguard targets backdoor _behaviours_: install-time code execution today, and
capability signals (unexpected network, filesystem, and process access),
obfuscation, and prompt injection aimed at coding agents next. No static
scanner can prove a package is free of backdoors, a novel or heavily obfuscated
one can evade heuristics, so vetguard raises evidenced signals and reports "no
findings", never "safe".

## Principles

- **Never executes the code it scans.** It reads manifests, lockfiles, and
  package metadata as data.
- **Honest verdicts.** When something cannot be verified (offline, private
  registry, unsupported lockfile), vetguard reports "could not verify", never
  "safe".
- **Near-zero runtime dependencies.** A supply-chain scanner should not ship a
  large dependency tree of its own.
- **No telemetry.** The only network calls are the registry lookups a scan
  needs, and `--offline` disables even those.

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
