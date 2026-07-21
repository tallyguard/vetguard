# CLAUDE.md - vetguard

Operating rules and context for AI-assisted development of this repo. The
product is a tool for detecting vulnerabilities in npm packages. It is a
security product, so correctness and honest output are first-class
requirements: a false "safe" verdict is worse than no verdict. When in doubt,
prefer the safe, auditable option over the clever one.

Stack: TypeScript (ESM, `type: module`), Node >=20 (`.nvmrc` pins 22), Vitest,
eslint 9 (flat config) + prettier, tsup build. Runtime dependencies are kept at
near-zero on purpose (see section 4). Package/CLI name: `vetguard`.

---

## 1. Gating rules (non-negotiable)

These apply to every response and every action.

- **Do not guess. Do not assume.** If information is missing, ambiguous, or
  outside your knowledge, say so and ask before proceeding.
- **Surface blocking questions first.** Before responding, identify whether any
  unanswered question could materially change the output. If so, raise it first
  and wait for the answer.
- **One feature at a time.** Do not start the next change until the current one
  is complete, proven, and (when asked) committed. Keep each diff small and
  reviewable. No batching of unrelated work.
- **Prioritise correctness over speed.** A slower correct result beats a fast
  wrong one, always.
- **Self-review before delivering.** Re-read the work, verify every claim, fix
  what you find. Only surface an issue you cannot resolve.
- **No preamble, no methodology narration, no restating the question.** Deliver
  results directly.
- **The human is the done-gatekeeper.** AI self-attestation never flips a
  feature to done.

### What "proven" means here

A result is done only when demonstrated, not asserted.

- Claims about code are backed by reading or running the code, never by
  recollection or pattern-matching.
- Behavioural claims ("this works", "tests pass") are backed by actually
  running the command and showing its output.
- **No false positives.** A passing test that does not exercise the change does
  not count. Changing a test to make it pass, rather than fixing the underlying
  bug, is a defect, not a fix.
- For anything with a runtime surface, drive the real flow (or a test that
  does), not just typecheck. If that is not feasible, say why and what you did
  instead.
- **Re-verify recorded facts** (versions, paths, counts, doc claims) against
  the live code before relying on them. When record and reality disagree,
  reality wins and the record is fixed in the same change.

---

## 2. The per-change loop (in order)

1. **Analyse** the request: what is being asked and why.
2. **Investigate:** read the relevant code and docs and confirm how things
   actually behave. No assumptions.
3. **Plan the smallest correct change** for one feature.
4. **Audit the plan against the code.** If it misses something or creates a new
   problem, return to step 2.
5. **Implement.**
6. **Prove it** (section 1). Capture the evidence.
7. **Audit the change.** If a gap is found, return to step 2.
8. **Update the index** (section 5) if the change altered any recorded fact,
   decision, or structure.
9. **Commit** only when asked, with a clear message.

---

## 3. Commands (the CI gate)

```
npm run dev            # tsx src/cli.ts (run the CLI from source)
npm run build          # tsup -> dist/ (cli.js + index.js + .d.ts)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm run format:check   # prettier --check .
npm test               # vitest run
npm run test:watch     # vitest (watch mode)
```

The CI gate (`.github/workflows/ci.yml`, Node 20 and 22) runs, in order:
typecheck, lint, format:check, test, build, then a dogfood scan
(`node dist/cli.js scan .`). Before calling any nontrivial change done, run
typecheck, lint, and test and report the results; run build for anything that
touches the CLI entry, exports, or the bundle. A change that fails the gate is
not done.

---

## 4. Architecture and layering (do not break these)

Full design is in `docs/PLAN.md`. The load-bearing rules:

- **Collection is separated from judgment.** Collectors do all IO (registry,
  filesystem, lockfiles, tarballs) and produce `PackageFacts`
  (`src/core/model.ts`). Detectors are **pure functions**
  (`(PackageFacts) => Finding[]`) under `src/core/rules/`: no network, no
  filesystem, no side effects. A detector that needs IO means a fact is
  missing from the collector, not that the detector should reach out. This is
  what keeps detectors unit-testable and CI deterministic.
- **The core is ecosystem-agnostic; npm is one adapter** under
  `src/ecosystems/npm/`. Keep npm-specifics out of `src/core/`. PyPI is the
  planned second adapter and is the test of this boundary.
- **New detectors register in `src/core/rules/index.ts`** and ship with unit
  tests. Every detector has a stable `ruleId`.
- **Verdicts must be traceable.** Every `Finding` carries `ruleId`, `severity`,
  `confidence`, the concrete evidence, and a one-line "why". No unexplainable
  results.
- **Degrade honestly.** A fact that could not be established is `undefined`,
  never a default that reads as "safe". The report verdict is
  `clean` / `findings` / `could-not-verify`; only a fully-checked clean scan is
  `clean`. See `decideVerdict` in `src/core/engine.ts`.
- **Treat scanned packages as hostile input.** Never execute, `require`, or
  eval code from a package under analysis. Parse it as data. Tarball and
  archive reads must be zip-slip-proof and size-capped. Any sandboxing
  exception must be an explicit, documented decision in `docs/DECISIONS.md`.
- **Near-zero runtime dependencies.** Prefer Node built-ins (`fetch`, `fs`,
  `node:util` `parseArgs`, streams). Adding a runtime dependency requires a
  `docs/DECISIONS.md` entry justifying it; a scanner that ships a large
  dependency tree refutes its own thesis.
- **No telemetry, no phone-home.** The only network calls are the lookups a
  scan needs (npm registry, downloads API, OSV); `--offline` disables even
  those. A user's dependency list is sensitive.
- **Secrets never ship in the repo.** `.env*` stays gitignored; any tokens come
  from the environment.

---

## 5. Index and cache (how the AI finds and keeps context)

The `docs/` directory is the persistent memory of this project. Read before
deriving; update in the same change that invalidates a record.

- `docs/INDEX.md` - the map. One line per doc. Every new doc gets a line here
  in the same commit that creates it.
- `docs/PROJECT-STATE.md` - the cache. Current facts: stack, structure,
  commands, external services, what is built and what is not. **Start every
  planning task by reading this file.** It exists so the AI does not re-derive
  or re-guess the state of the project each session.
- `docs/DECISIONS.md` - the decision log. Dated, append-only. Any choice that
  would otherwise be re-litigated (stack, data source, architecture, naming)
  gets an entry with the reason and the alternatives rejected.

Rules:

- **Stale records are bugs.** If a change makes any doc wrong, fixing the doc
  is part of that change, not a follow-up.
- **Docs record conclusions, not narration.** No meeting-minutes prose; state
  the fact, the reason, the date.
- Plans for multi-step work live in `docs/` as their own file (listed in the
  index), so a fresh session can resume from them.

### Doc visibility (this is a public repo)

Everything committed is world-readable. Before writing a doc, decide where it
belongs:

- **Public (`docs/`, committed):** architecture, roadmap, decisions,
  prior-art, contributor guides, detection methodology. Transparency is a
  feature here; publishing how detection works invites scrutiny and
  contribution, it does not weaken the tool.
- **Never commit:** secrets, tokens, private keys, real user dependency data,
  unpublished-vulnerability details before coordinated disclosure, personal or
  business-sensitive notes. If such a doc is needed, keep it in
  `docs/private/` (gitignored) or in the local memory dir, never in the tree.
- When unsure whether something is safe to publish, treat it as private and
  ask.

---

## 6. Standards and Git

- **No redundant comments.** A comment must earn its place by adding what the
  code cannot show: a non-obvious constraint, a "why", an external reference,
  or a gotcha. Git history already records what changed and when; do not
  narrate it in a comment. When in doubt, leave it out; delete redundant
  comments you touch.
- **No em dashes anywhere.** Use periods, commas, or hyphens; convert any you
  touch.
- **No emojis** in code, commits, or user-facing strings.
- **No AI-tell patterns.** No unicode arrows, checks, or crosses in code
  comments or output; no box-drawing comment headers (plain `// --- Section
---` is fine); none of the stock AI marketing vocabulary ("seamless",
  "effortless", "empower", "unlock", "streamline", "cutting-edge",
  "game-changing"). Write like a person: concrete claims, plain verbs.

### Commits

- **No authorship trailers, ever.** No `Co-Authored-By`, no "Generated with
  Claude Code" lines. Commit messages stay clean.
- **One or two lines.** A concise imperative subject (roughly <=72 chars); an
  optional second line only if it genuinely adds context. No long bodies, no
  bullet lists in the message. The diff and the PR carry the detail.
- Imperative mood ("add registry client", not "added" or "adds"). No emojis,
  no em dashes.
- One logical change per commit. Do not batch unrelated work.

### Branching and merging

- **`main` is always green and always releasable.** Never commit directly to
  `main` except the initial import. The CI gate must pass on `main` at all
  times.
- **Every change lands on a short-lived branch**, named `type/slug`:
  `feat/`, `fix/`, `docs/`, `chore/`, `refactor/`, `test/`. One feature per
  branch, kept small and reviewable.
- **Merge via pull request.** Open a PR with `gh`, let the CI gate run, then
  merge. Use squash merge to keep `main` history one-commit-per-feature; the
  squash commit follows the commit rules above (1-2 lines, no trailers).
- Delete the branch after merge. Keep `main` up to date locally (`git pull`)
  before starting the next branch.
- **Community contributions** arrive as PRs from forks. Treat them by the same
  gate: CI green, rules followed, tests included. See `CONTRIBUTING.md`.

### Driving

The maintainer has delegated day-to-day dev, testing, branching, merging,
pushing, and docs. Proceed through the per-change loop without asking for
routine steps. Still pause and surface for: destructive or irreversible actions
(force-push, history rewrite, deleting `main`, publishing to npm, deleting the
repo), anything that changes project direction, and anything touched by the
gating rules in section 1.

## 7. Testing

Vitest. Tests live in `tests/**/*.test.ts` (unit tests under `tests/unit/`);
fixtures go under `tests/fixtures/` and are excluded from typecheck, lint, and
prettier. The default `npm test` run must not hit the live network; collectors
are tested against recorded/mocked responses, and any live-API smoke test is a
separate, manually-run job.

- Add or adjust tests for any behaviour change, especially detection logic:
  a detector change without a test proving the new verdict is incomplete.
- **Never commit real malware as a fixture.** Author benign samples that carry
  the _pattern_ a detector keys on. Detectors are pure, so a fixture is usually
  just a `PackageFacts` object, not a real package.
- Hostile-input tests (zip-slip, decompression bombs, malformed JSON, unicode
  tricks) are security tests and are stop-the-line.
- **Test and proof integrity is law.** Every test passes cleanly. A test that
  only passes on retry is failing; fix the bug, not the test.
- **A red test is stop-the-line, no matter who wrote it.** The whole suite must
  be green, not just the tests touching your change. Never report work as
  done, or move to the next change, while any test is failing.
