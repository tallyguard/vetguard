# /review

Per-change review before any change is called done, graded A to D. Only A is
passable. The reviewer is not the author: someone other than the author of
the change (a fresh subagent, at most 2 running at once, global law) grades
it. Run this at step 7 of the per-change loop in `CLAUDE.md` before
anything is reported as done.

## Scale (binding, from `~/.config/kilo/AGENTS.md`)

- **A** pass. Every claim proven: the gate ran green on this tree, the new
  behaviour is demonstrated by a real run or test, docs match reality. No
  findings.
- **B** minor gaps. Works, but a minor verified defect, a weakened or
  missing test, a stale doc line, or a claim without captured evidence.
  Back to the loop, then re-grade.
- **C** material gaps. The change misses its stated goal, breaks a rule in
  `CLAUDE.md` section 4, weakens honesty of verdicts, or is unproven. Stop;
  fix at the layer that failed.
- **D** fail. Broken, insecure, dishonest or regressed gate. Stop-the-line.

## Checklist (each item needs evidence, cite it)

1. **Gate.** `npm run typecheck`, `npm run lint`, `npm run format:check`,
   `npm test` all green on this exact tree; `npm run build` too when the
   CLI entry, exports or bundle changed. Paste or cite the outputs.
2. **Proven, not asserted.** Behavioural claims are backed by a run (CLI
   invocation with its output, or a test that exercises the change). A test
   that does not exercise the change does not count.
3. **Tests.** Behaviour change ships with a test proving the new verdict.
   No test was weakened, skipped, deleted or made conditional to pass.
4. **Hostile input.** If the change touches a parse, network or file
   surface: malformed input handled, size caps hold, no execution of
   scanned content, no new safe-looking default for a missing fact.
5. **Layering.** Detectors stay pure (no IO in `src/core/rules/`), npm
   specifics stay under `src/ecosystems/npm/`, new detectors registered in
   `src/core/rules/index.ts` with a stable `ruleId` and a unit test.
6. **Docs.** Every recorded fact the change invalidates is fixed in the
   same change (README, PROJECT-STATE, DECISIONS if a decision was made,
   INDEX line for new docs).
7. **Standards.** Comment policy, no dead code, no em dashes, no emojis,
   no AI-tell vocabulary, commit message rules (if committing), one logical
   change, smallest correct diff.

## Output

A grade per checklist item plus one overall grade, findings with severity
and evidence (file:line, command output), and for anything below A the one
thing that must change to reach A. Below A the change is not done; it goes
back to step 2 of the per-change loop. The report goes in the chat.
