# /audit

Full audit of this repository, graded A to D. Only A is passable. This is a
security product: a false "safe" verdict is worse than no verdict, and
scanned packages are hostile input. The auditor never grades work the auditor
authored: a fresh subagent (at most 2 running at once, global law) grades
where independence is required.

## Scale (binding, from `~/.config/kilo/AGENTS.md`)

- **A** pass. Every claim backed by a command run, a file:line citation or a
  live check. No findings.
- **B** minor gaps. Verified minor defects, missing proof, or records not
  matching reality. Dated improvement plan naming the layer and the evidence
  that would raise it to A.
- **C** material gaps. Real defects or unverified claims that undermine the
  core promise. Improvement plan plus a stop on building on top of it.
- **D** fail. Broken, insecure, dishonest or unproven. Stop-the-line; fix
  the layer, never the paint.

## Process (in order, none skipped)

1. **Ground truth.** `git status`, `git log --oneline -10`, read
   `docs/PROJECT-STATE.md`, `docs/DECISIONS.md`, past audit remediation
   docs. The audit covers what is actually in the tree, not what docs claim.
2. **Full read.** Every file under `src/`, plus `action.yml`,
   `.github/workflows/`, `scripts/`, `eslint.config.js`, `tsconfig.json`,
   `vitest.config.ts`, `tsup.config.ts`, `.gitignore`. Map every network,
   filesystem, process and configuration surface.
3. **Adversarial pass.** For each surface: hostile input (malformed JSON,
   unicode tricks, huge payloads, zip-slip, path traversal), injection
   (prototype pollution, ANSI/terminal escape injection, SARIF/JSON output
   escaping), ReDoS and algorithmic blowups in name matching, missing size
   caps, SSRF and URL handling, secrets in the tree, unsafe redirects,
   error paths that read as "clean". A finding needs a file:line and a
   concrete failure story, not a vibe.
4. **Verification pass.** Check machine state first (RAM law), then run the
   real gate: `npm run typecheck`, `npm run lint`, `npm run format:check`,
   `npm test`, `npm run build`, and the offline dogfood
   `node dist/cli.js scan . --offline`. Record actual outputs. Verify
   README and docs claims against the live code (detector list, command
   list, exit codes, version pins).
5. **Independent review.** A fresh subagent (or, where subagents are not
   allowed, PJ names the reviewer) regrades the findings and the overall
   areas against this rubric without seeing the auditor's grades first.
   Disagreements are resolved by evidence, not seniority.
6. **Report (in the chat, never only in a file).** One grade per area:
   correctness and honesty of verdicts, hostile-input security, supply
   chain of vetguard itself (deps, action, release flow), CI gate health,
   docs accuracy, code standards. Every finding: severity, evidence
   (file:line or command output), the fix at the right layer. Anything
   below A gets an improvement plan with the evidence that would raise it.
   Open questions for PJ are listed in the chat, not buried in the report.
7. **Record.** With PJ's go-ahead, write the report to
   `docs/AUDIT-<date>.md`, add the `docs/INDEX.md` line, and update
   `docs/PROJECT-STATE.md`. Remediation items become work items; they are
   not closed by assertion, only by demonstrated fix plus re-grade.

## Standing checks for this repo

- No execution of scanned code anywhere (`require`, `import`, `eval`,
  `vm`, child processes on package content).
- Every tarball/archive read is zip-slip-proof and size-capped.
- `decideVerdict` can only say `clean` on a fully-checked scan; degraded
  facts stay `undefined`, never a safe-looking default.
- Runtime dependencies stay at zero unless `docs/DECISIONS.md` says
  otherwise.
- No telemetry; `--offline` makes no network calls (grep the code paths, do
  not trust the flag name).
- Secrets never in the tree; `.env*` ignored.
- Workflows: least-privilege permissions, pinned action versions, no
  pull_request_target with checkout of PR head, provenance intact.
