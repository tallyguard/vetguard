# vetguard

A free, open-source, local-first scanner for the npm supply-chain threats that
AI-assisted development created: hallucinated (slopsquatted) dependencies,
typosquats, malicious young packages, and prompt injection aimed at coding
agents. No account, no server, no telemetry.

> Status: early development (Phase 0). The toolchain, core model, detector
> pipeline, and first detector are in place. Registry checks, lockfile
> resolution, and the deep analyzers are landing next. See
> [docs/PLAN.md](docs/PLAN.md) for the roadmap.

## Why

Standard scanners answer "does this dependency have a known CVE?" That misses
the attacks that AI coding assistants opened up. An assistant confidently
suggests a package name that does not exist; an attacker registers it; the
next assistant installs it. A freshly registered malicious package has no
advisory history, so CVE-first tools are blind to it. vetguard targets that gap
first, and includes known-CVE lookup for a complete answer.

## Install

Not yet published. Once released:

```
npx vetguard scan
```

## Usage

```
vetguard scan [dir]     Scan a project's dependencies (defaults to cwd)
vetguard --help         Show help
vetguard --version      Show version
```

vetguard never executes the code it scans. It reads manifests, lockfiles, and
package contents as data. When it cannot verify something (offline, private
registry, unsupported lockfile), it reports "could not verify" rather than
"safe".

## Development

```
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Requires Node >= 20 (see `.nvmrc`). Contributor and design docs live in
[docs/](docs/); [CLAUDE.md](CLAUDE.md) holds the operating rules for the repo.

## License

Apache-2.0. See [LICENSE](LICENSE).
