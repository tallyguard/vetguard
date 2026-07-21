# Releasing vetguard to npm

Publishing is automated with npm provenance: creating a GitHub Release runs
`.github/workflows/release.yml`, which builds, runs the full gate, and publishes
with a signed provenance attestation. The maintainer does two things once
(token), then one thing per release (cut a release).

## One-time setup

1. Create an npm access token with publish rights for `vetguard`:
   - npmjs.com, Access Tokens, Generate New Token, Granular Access Token.
   - Permissions: Read and write. Scope it to the `vetguard` package (or the
     account) and set an expiry you are comfortable with.
2. Add it to the repository as a secret named `NPM_TOKEN`:
   - GitHub, repo Settings, Secrets and variables, Actions, New repository
     secret, name `NPM_TOKEN`, value the token.

Provenance also requires the workflow's `id-token: write` permission (already
set) and a public repository (it is). Nothing else is needed; there is no
server and no cost.

## Cutting a release

1. Bump `version` in `package.json` on a branch, open a PR, and merge it once
   green. The CLI reads its version from `package.json`, so this is the single
   source of truth.
2. Create a GitHub Release whose tag is `v<version>` (for example `v0.1.0`,
   matching the `package.json` version exactly; the workflow fails the publish
   if they differ).
3. The Release workflow runs and publishes `vetguard@<version>` to npm with
   provenance.

After the first successful publish, `npx vetguard` and the reusable GitHub
Action (`uses: Poolchaos/vetguard@v1`) work for everyone.

## Manual fallback

If you need to publish from your machine instead:

```
npm login
npm publish
```

`prepack` builds `dist/` first, and `publishConfig` sets public access. Local
publishes do not carry provenance (that requires the CI id-token), so prefer the
Release workflow.

## What ships

The published tarball contains only `dist/` (the bundled CLI, library, types,
and the popular-package corpus), `LICENSE`, `README.md`, and `package.json`.
Source, tests, and docs are not published. Verify before a release with:

```
npm run build && npm pack --dry-run
```
