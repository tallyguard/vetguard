# vetguard

A free, open-source, local-first scanner for the npm supply-chain threats that
AI-assisted development created: hallucinated (slopsquatted) dependencies,
typosquats, and freshly registered malicious packages. No account, no server,
no telemetry.

> Early development. `scan` and `check` work today with two detectors live
> (`nonexistent-package`, `young-package`); more detectors, lockfile
> resolution, and a GitHub Action are landing next. Roadmap:
> [docs/PLAN.md](docs/PLAN.md).

## Why

Standard scanners answer "does this dependency have a known CVE?". That misses
the attacks AI coding assistants opened up: an assistant suggests a package
name that does not exist, an attacker registers it, and the next assistant
installs it. A freshly registered malicious package has no advisory history, so
CVE-first tools cannot see it. vetguard targets that gap.

## Install

Not yet published to npm. For now, run from source (see Development). Once
released:

```
npx vetguard scan
```

## Usage

```
vetguard scan [dir]     Scan a project's dependencies (defaults to cwd)
vetguard check <pkg>    Vet a single package before installing
                        (e.g. vetguard check some-package, foo@1.2.3)
vetguard --help         Show help
vetguard --version      Show version

  --offline             Do not contact the registry
```

Exit codes: `0` clean or could-not-verify, `1` findings, `2` usage or read
error. `check` makes vetguard usable as a pre-install gate, including for
coding agents that add dependencies.

## What it checks

Every finding carries a rule id, severity, and concrete evidence, so a verdict
is always traceable to why. Live today:

- **nonexistent-package**: a dependency name with no record on the registry,
  the clearest hallucination signal, before an attacker registers it.
- **young-package**: a recently first-published name with low or unknown
  adoption, the profile of a fresh registration standing in for a hallucinated
  or look-alike name.

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
