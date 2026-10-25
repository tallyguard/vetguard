# AGENTS.md - vetguard (Kilo and other agents)

`CLAUDE.md` in this repo is the canonical operating rules file for every
coding agent working here, not only Claude Code. Read it in full before
working and apply it: the gating rules (do not guess, one feature at a time,
proven means demonstrated), the per-change loop, the CI gate commands, the
architecture layering rules in section 4, the docs-as-memory rules in
section 5, and the standards in section 6 (comment policy, no em dashes, no
emojis, no AI-tell patterns, commit and branching rules). When this file and
CLAUDE.md disagree, CLAUDE.md wins.

Global law also applies (see `~/.config/kilo/AGENTS.md`): Claude Code parity
with `~/.claude/CLAUDE.md` (binding design, architecture, business and
Blender standards, applied without being asked), and the audit and review
grading law: every audit, review or grade uses an A to D scale, **only A is
passable**, findings carry evidence, and the reviewer is never the author.

## Kilo commands

- `.kilo/command/audit.md` (`/audit`): full audit of this repo, graded A to
  D, only A passes.
- `.kilo/command/review.md` (`/review`): per-change review before any change
  is called done, graded A to D, only A passes.

Both bind this repo's security posture: vetguard is a security product, a
false "safe" verdict is worse than no verdict, and scanned packages are
hostile input.
