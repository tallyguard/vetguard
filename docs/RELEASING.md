# Releasing vetguard to npm

Publishing uses npm **trusted publishing (OIDC)**: GitHub Actions authenticates
to npm directly for one publish, so there is no long-lived token to store,
rotate, or leak, and provenance is generated automatically. The release
workflow is `.github/workflows/release.yml`.

The one-time setup (bootstrap publish and trusted-publisher registration) is
already done; see "One-time setup (completed)" at the bottom for the record.
Day to day, releasing is just the three steps below.

## Cutting a release

1. Bump `version` in `package.json` on a branch, open a PR, merge it green. The
   CLI reads its version from `package.json`, so it is the single source of
   truth.
2. Create a GitHub Release whose tag is `v<version>` (e.g. `v0.2.0`, matching
   `package.json` exactly; the workflow fails the publish if they differ).
3. The release workflow verifies the tag, runs the gate, builds, and publishes
   via OIDC with provenance. No token, no `--provenance` flag.

That is the whole process. The workflow needs nothing you have to supply per
release.

## Version and Action-tag policy

- Pre-1.0, releases are exact tags (`v0.1.0`, `v0.2.0`, ...) and the GitHub
  Action must be pinned to an exact tag (`uses: tallyguard/vetguard@v0.2.0`),
  because 0.x minor versions may change behaviour.
- At the 1.0 release, start maintaining a moving `v1` major tag that points at
  the latest 1.x release, so Action users can pin `@v1`. Update the README
  example then.
- New detectors ship in minor versions. Any change to a rule id, the JSON
  `schemaVersion`, the SARIF shape, or a finding's default severity is called
  out in the release notes.

## Troubleshooting

A failed OIDC publish surfaces as a misleading `404` or `ENEEDAUTH`, not an
"OIDC mismatch". When that happens, suspect, in order: npm older than 11.5.1,
then an exact-match problem in the trusted-publisher config (workflow filename,
org, repo, environment). It rarely means the package or a secret is missing.

## Scheduled workflows

`evaluate.yml` (weekly accuracy eval) and `refresh-corpus.yml` (monthly corpus
refresh) run on cron. GitHub auto-disables cron schedules in a repo with no
commit activity for 60 days, and scheduled runs do not reset that clock. If the
repo goes quiet, the Actions tab shows a "workflows disabled" banner; re-enable
with `gh workflow enable "Accuracy evaluation"` and
`gh workflow enable "Refresh popular-package corpus"` (or the button in the UI).
This is an accepted operational caveat, not a bug: both are non-critical, and
any human PR runs the full gate regardless. You can always run either on demand
with `gh workflow run "<name>"`.

## What ships

Only `dist/` (the bundled CLI, library, types, and popular-package corpus),
`LICENSE`, `README.md`, and `package.json`. Verify before a release with:

```
npm run build && npm pack --dry-run
```

## One-time setup (completed)

Recorded for reference; you do not repeat these.

- **Bootstrap** (done): npm cannot configure trusted publishing for a package
  that does not exist yet (npm/cli#8544), so the name was created with a local
  `npm publish` of a `0.0.0` placeholder, which was unpublished after `0.1.0`
  shipped.
- **Trusted publisher** (done): registered at
  `https://www.npmjs.com/package/vetguard/access` -> Trusted publishing ->
  GitHub Actions, with organization `tallyguard`, repository `vetguard`,
  workflow filename `release.yml`, no environment, allowed action `npm publish`.
  These must match the workflow exactly; only one trusted publisher is allowed
  per package. Editing it requires a real 2FA web session.
- **Workflow requirements** (in `release.yml`): a public repo (so provenance can
  attest), `id-token: write`, a GitHub-hosted runner, Node 24 with
  `npm install -g npm@latest` (OIDC needs npm >= 11.5.1; Node 22 ships 10.9.x),
  no `NODE_AUTH_TOKEN`, and no `--provenance` flag (automatic under OIDC).
