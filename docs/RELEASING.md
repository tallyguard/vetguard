# Releasing vetguard to npm

Publishing uses npm **trusted publishing (OIDC)**: GitHub Actions authenticates
to npm directly for one publish, so there is no long-lived token to store,
rotate, or leak, and provenance is generated automatically. The release
workflow is `.github/workflows/release.yml`.

One catch: npm cannot configure trusted publishing for a package that does not
exist yet (npm/cli#8544). So the very first publish is a one-time bootstrap;
every release after that is tokenless OIDC.

## Requirements (already met)

- Public repo (`github.com/tallyguard/vetguard`) so provenance can be attested.
- The release job grants `id-token: write` and runs on a GitHub-hosted runner
  with Node 24 (npm >= 11.5.1, the OIDC floor) plus an explicit
  `npm install -g npm@latest`.

## Step 1: bootstrap the package (one time only)

Publish a placeholder version from your machine to create the name on npm. This
needs no CI token, just an interactive login.

```
npm login          # web/2FA login
npm version 0.0.0 --no-git-tag-version   # temporary placeholder, do not commit
npm publish        # creates the vetguard package on npm
git checkout package.json                # restore the real version (0.1.0)
```

The placeholder has no provenance (local publishes cannot attest); we deprecate
it after the first real release. If you would rather skip the placeholder,
publish the real `0.1.0` here instead, but then do not also cut a `v0.1.0`
GitHub Release (it is already on npm), and `0.1.0` will lack provenance.

## Step 2: register the trusted publisher (one time only)

Do this in the npmjs.com web UI under a real 2FA session (from early August 2026
a token cannot change this configuration).

Go to `https://www.npmjs.com/package/vetguard/access` -> Trusted publishing ->
GitHub Actions, and enter exactly:

| Field                | Value                                    |
| -------------------- | ---------------------------------------- |
| Organization or user | `tallyguard` (exact case; it is an org)  |
| Repository           | `vetguard` (repo name only, no owner)    |
| Workflow filename    | `release.yml` (filename only, with .yml) |
| Environment name     | leave blank                              |
| Allowed actions      | npm publish                              |

These must match the workflow exactly; a wrong case or a stray space is a real
cause of rejection. Only one trusted publisher is allowed per package.

## Step 3: cut releases (every version, tokenless)

1. Bump `version` in `package.json` on a branch, open a PR, merge it green. The
   CLI reads its version from `package.json`, so it is the single source of
   truth.
2. Create a GitHub Release whose tag is `v<version>` (e.g. `v0.1.0`, matching
   `package.json` exactly; the workflow fails the publish if they differ).
3. The release workflow verifies the tag, runs the gate, builds, and publishes
   via OIDC with provenance. No token, no `--provenance` flag.

After the first successful OIDC release, deprecate the placeholder:

```
npm deprecate vetguard@0.0.0 "placeholder for the first publish; use >=0.1.0"
```

## Troubleshooting

A failed OIDC publish surfaces as a misleading `404` or `ENEEDAUTH`, not an
"OIDC mismatch". When that happens, suspect, in order: npm older than 11.5.1,
then an exact-match problem in the trusted-publisher config (workflow filename,
org, repo, environment). It rarely means the package or a secret is missing.

## What ships

Only `dist/` (the bundled CLI, library, types, and popular-package corpus),
`LICENSE`, `README.md`, and `package.json`. Verify before a release with:

```
npm run build && npm pack --dry-run
```
