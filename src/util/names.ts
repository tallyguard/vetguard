/**
 * Pure helpers for package-name near-miss analysis: no IO, no corpus. They
 * implement the single-edit transform classes real typosquat tools rely on
 * (deletion, insertion, substitution, adjacent transposition) plus separator
 * collapse. Only ASCII is considered; npm rejects non-ASCII names, so a
 * unicode-homoglyph collision cannot be registered in the first place.
 */

/** npm name characters usable for generated edits (registrable, lowercase). */
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789-_.".split("");

const SEPARATORS = /[-_.]/g;

/** Lowercase and strip separators: the npm "moniker" key that collapses separator and case tricks. */
export function depunctuate(name: string): string {
  return name.toLowerCase().replace(SEPARATORS, "");
}

/** All strings within OSA distance 1 of `word` (deletion, transposition, substitution, insertion). */
export function edits1(word: string): Set<string> {
  const result = new Set<string>();
  const n = word.length;
  for (let i = 0; i < n; i++) {
    result.add(word.slice(0, i) + word.slice(i + 1));
  }
  for (let i = 0; i < n - 1; i++) {
    result.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  for (let i = 0; i < n; i++) {
    for (const c of ALPHABET) {
      if (c !== word[i]) result.add(word.slice(0, i) + c + word.slice(i + 1));
    }
  }
  for (let i = 0; i <= n; i++) {
    for (const c of ALPHABET) {
      result.add(word.slice(0, i) + c + word.slice(i));
    }
  }
  result.delete(word);
  return result;
}

// QWERTY physical adjacency, used only to raise confidence on a substitution
// (a fat-finger neighbour), never to widen the edit budget.
const QWERTY_ROWS = ["1234567890-", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
const QWERTY_ADJ: Map<string, Set<string>> = (() => {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a)!.add(b);
  };
  for (let r = 0; r < QWERTY_ROWS.length; r++) {
    const row = QWERTY_ROWS[r]!;
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]!;
      if (c > 0) add(ch, row[c - 1]!);
      if (c < row.length - 1) add(ch, row[c + 1]!);
      const below = QWERTY_ROWS[r + 1];
      if (below && below[c]) add(ch, below[c]!);
      const above = QWERTY_ROWS[r - 1];
      if (above && above[c]) add(ch, above[c]!);
    }
  }
  return adj;
})();

export function keyboardAdjacent(a: string, b: string): boolean {
  return QWERTY_ADJ.get(a)?.has(b) ?? false;
}

export type Transform =
  | "separator"
  | "transposition"
  | "substitution-adjacent"
  | "substitution"
  | "insertion"
  | "deletion";

/**
 * Classifies how `candidate` differs from `target`, assuming they are already
 * known to be within one edit or a separator variant. Returns undefined if the
 * relationship is not one of the recognised single transforms. A trailing-s
 * difference (color/colors) is reported as insertion/deletion, not a distinct
 * "plural", because structurally it is the same single edit.
 */
export function classifyTransform(candidate: string, target: string): Transform | undefined {
  if (candidate === target) return undefined;
  if (depunctuate(candidate) === depunctuate(target)) return "separator";

  const lenDiff = candidate.length - target.length;
  if (lenDiff === 0) {
    const diffs: number[] = [];
    for (let i = 0; i < candidate.length; i++) {
      if (candidate[i] !== target[i]) diffs.push(i);
    }
    if (diffs.length === 1) {
      const i = diffs[0]!;
      return keyboardAdjacent(candidate[i]!, target[i]!) ? "substitution-adjacent" : "substitution";
    }
    if (
      diffs.length === 2 &&
      diffs[1] === diffs[0]! + 1 &&
      candidate[diffs[0]!] === target[diffs[1]!] &&
      candidate[diffs[1]!] === target[diffs[0]!]
    ) {
      return "transposition";
    }
    return undefined;
  }
  if (lenDiff === 1) return "insertion";
  if (lenDiff === -1) return "deletion";
  return undefined;
}
