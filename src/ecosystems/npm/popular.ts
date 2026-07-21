import { classifyTransform, depunctuate, edits1, type Transform } from "../../util/names.js";
import { POPULAR_META, POPULAR_NAMES } from "./data/popular-packages.js";

/**
 * Only names within the top-ranked head are plausible squat targets; a near-miss
 * of the 12,000th package is not a realistic attack and is where false positives
 * concentrate. Self-membership suppression still uses the full corpus.
 */
export const TARGET_RANK = 5000;

/** Distance-based matching is meaningless on very short names (ms/qs/os are all one edit apart). */
export const SHORT_NAME_FLOOR = 4;

export interface NearMiss {
  target: string;
  rank: number;
  transform: Transform;
}

export interface PopularCorpus {
  /** Raw membership, the self-suppression check: a corpus name is never a squat. */
  has(name: string): boolean;
  rankOf(name: string): number | undefined;
  /** Best (most popular) near-miss target for a name that is NOT itself a member. */
  findNearMiss(name: string): NearMiss | undefined;
  readonly size: number;
}

/**
 * Builds corpus indexes once from a name list. Exposed so tests can build a
 * small deterministic corpus; production uses `defaultCorpus` over the bundled
 * npm-high-impact snapshot.
 */
export function buildCorpus(names: readonly string[]): PopularCorpus {
  const rank = new Map<string, number>();
  const depunctToBest = new Map<string, { name: string; rank: number }>();

  names.forEach((raw, index) => {
    const name = raw.toLowerCase();
    if (!rank.has(name)) rank.set(name, index);
    const key = depunctuate(name);
    const existing = depunctToBest.get(key);
    if (!existing || index < existing.rank) depunctToBest.set(key, { name, rank: index });
  });

  const has = (name: string): boolean => rank.has(name.toLowerCase());
  const rankOf = (name: string): number | undefined => rank.get(name.toLowerCase());

  function findNearMiss(input: string): NearMiss | undefined {
    const name = input.toLowerCase();
    if (rank.has(name)) return undefined;

    const candidates: NearMiss[] = [];

    // Separator / case collapse: same moniker key as a different popular name.
    const depunctMatch = depunctToBest.get(depunctuate(name));
    if (depunctMatch && depunctMatch.name !== name && depunctMatch.rank <= TARGET_RANK) {
      candidates.push({
        target: depunctMatch.name,
        rank: depunctMatch.rank,
        transform: "separator",
      });
    }

    // Short names are skipped: too many popular names sit one edit apart (ms/qs/os).
    if (name.length > SHORT_NAME_FLOOR) {
      for (const edit of edits1(name)) {
        const r = rank.get(edit);
        if (r === undefined || r > TARGET_RANK) continue;
        const transform = classifyTransform(name, edit) ?? "substitution";
        candidates.push({ target: edit, rank: r, transform });
      }
    }

    if (candidates.length === 0) return undefined;
    // Prefer the most popular (lowest rank) target.
    return candidates.reduce((best, c) => (c.rank < best.rank ? c : best));
  }

  return { has, rankOf, findNearMiss, size: rank.size };
}

export const defaultCorpus: PopularCorpus = buildCorpus(POPULAR_NAMES);
export { POPULAR_META };
