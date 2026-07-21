# Contributing to vetguard

Thanks for helping make the npm ecosystem harder to attack. vetguard is a
free, open-source, local-first scanner for AI-era supply-chain threats, and
community contributions, especially new detectors and fixture cases, are
welcome.

## Ground rules

- **Never commit real malware.** Detectors are tested against benign fixtures
  that carry the _pattern_ a detector keys on, not live malicious packages. A
  PR containing real malicious code will be closed.
- **No new runtime dependencies without discussion.** A supply-chain scanner
  that ships a large dependency tree undercuts its own thesis. vetguard aims
  for near-zero runtime dependencies (Node built-ins). Open an issue first if
  you think one is genuinely needed; it must be justified in `docs/DECISIONS.md`.
- **Honest verdicts only.** A fact vetguard could not establish is reported as
  "could not verify", never defaulted to "safe". Detectors carry traceable
  evidence, not opaque scores.

## Workflow

1. Fork and branch: `type/short-slug` (`feat/`, `fix/`, `docs/`, `test/`,
   `chore/`).
2. Make one focused change. Add or update tests for any behaviour change.
3. Run the gate locally, all of it must pass:

   ```
   npm install
   npm run typecheck
   npm run lint
   npm run format:check
   npm test
   npm run build
   ```

4. Commit in the imperative mood, one or two lines, no emojis, no authorship
   trailers.
5. Open a PR. CI runs the same gate on Node 20 and 22. A red gate blocks merge.

## Writing a detector

Detectors are pure functions from `PackageFacts` to `Finding[]` and live in
`src/core/rules/`. They must not perform IO; if a detector needs a fact,
add it to the collector that produces `PackageFacts`, not to the detector.
Register the detector in `src/core/rules/index.ts` and give it a stable
`ruleId` and unit tests. See `src/core/rules/nonexistent-package.ts` for the
shape and `docs/PLAN.md` for the detector catalog and design.

## Reporting a vulnerability

If you find a security issue in vetguard itself, do not open a public issue.
Follow [SECURITY.md](SECURITY.md).

## License

By contributing you agree your contributions are licensed under Apache-2.0,
the project license.
