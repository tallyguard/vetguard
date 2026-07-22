import {
  classifyTransform,
  depunctuate,
  edits1,
  sortedTokenKey,
  tokenize,
  type Transform,
} from "../../util/names.js";
import { POPULAR_META, POPULAR_NAMES } from "./data/popular-packages.js";

/**
 * Convention affixes that a hallucinated name commonly drops (unused-imports vs
 * eslint-plugin-unused-imports). Order does not matter; the tokens are added to
 * the candidate's set and looked up.
 */
const CONVENTION_AFFIXES: readonly string[][] = [
  ["eslint", "plugin"],
  ["eslint", "config"],
  ["babel", "plugin"],
  ["babel", "preset"],
  ["rollup", "plugin"],
  ["vite", "plugin"],
  ["webpack", "plugin"],
  ["gatsby", "plugin"],
];

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

export type RecombinationKind = "reordered" | "affix-drop";

export interface Recombination {
  victim: string;
  rank: number;
  kind: RecombinationKind;
}

/** A popular scoped package that an unscoped name resembles (a dropped-scope lookalike). */
export interface ScopedLookalike {
  target: string;
  rank: number;
}

export interface PopularCorpus {
  /** Raw membership, the self-suppression check: a corpus name is never a squat. */
  has(name: string): boolean;
  rankOf(name: string): number | undefined;
  /** Best (most popular) near-miss target for a name that is NOT itself a member. */
  findNearMiss(name: string): NearMiss | undefined;
  /** A popular package whose tokens this non-member name reorders or drops a convention affix from. */
  findRecombination(name: string): Recombination | undefined;
  /** A popular scoped package this unscoped, non-member name is a dropped-scope lookalike of. */
  findScopedLookalike(name: string): ScopedLookalike | undefined;
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
  const tokenKeyToBest = new Map<string, { name: string; rank: number }>();
  const scopedLookalikeToBest = new Map<string, { name: string; rank: number }>();

  names.forEach((raw, index) => {
    const name = raw.toLowerCase();
    if (!rank.has(name)) rank.set(name, index);

    const punctKey = depunctuate(name);
    const punctExisting = depunctToBest.get(punctKey);
    if (!punctExisting || index < punctExisting.rank) {
      depunctToBest.set(punctKey, { name, rank: index });
    }

    const tokens = tokenize(name);
    if (tokens.length >= 2) {
      const tokenKey = sortedTokenKey(tokens);
      const tokenExisting = tokenKeyToBest.get(tokenKey);
      if (!tokenExisting || index < tokenExisting.rank) {
        tokenKeyToBest.set(tokenKey, { name, rank: index });
      }
    }

    // Dropped-scope lookalike key: @babel/core -> "babelcore", so an unscoped
    // "babel-core" resolves to it. @types is allowlisted (DefinitelyTyped is
    // ownership-gated and its unscoped forms are not a realistic attack vector).
    if (name.startsWith("@")) {
      const slash = name.indexOf("/");
      const scope = slash > 1 ? name.slice(1, slash) : "";
      const pkg = slash > 1 ? name.slice(slash + 1) : "";
      if (scope && pkg && scope !== "types") {
        const key = depunctuate(`${scope}${pkg}`);
        const existing = scopedLookalikeToBest.get(key);
        if (!existing || index < existing.rank) {
          scopedLookalikeToBest.set(key, { name, rank: index });
        }
      }
    }
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

  function findRecombination(input: string): Recombination | undefined {
    const name = input.toLowerCase();
    if (rank.has(name)) return undefined;

    const tokens = tokenize(name);
    if (tokens.length < 2) return undefined;

    const reordered = tokenKeyToBest.get(sortedTokenKey(tokens));
    if (reordered && reordered.name !== name && reordered.rank <= TARGET_RANK) {
      return { victim: reordered.name, rank: reordered.rank, kind: "reordered" };
    }

    for (const affix of CONVENTION_AFFIXES) {
      const withAffix = tokenKeyToBest.get(sortedTokenKey([...tokens, ...affix]));
      if (withAffix && withAffix.name !== name && withAffix.rank <= TARGET_RANK) {
        return { victim: withAffix.name, rank: withAffix.rank, kind: "affix-drop" };
      }
    }
    return undefined;
  }

  function findScopedLookalike(input: string): ScopedLookalike | undefined {
    const name = input.toLowerCase();
    if (name.startsWith("@")) return undefined; // suspects are unscoped
    if (rank.has(name)) return undefined; // a corpus member is not a squat
    const hit = scopedLookalikeToBest.get(depunctuate(name));
    if (hit && hit.name !== name && hit.rank <= TARGET_RANK) {
      return { target: hit.name, rank: hit.rank };
    }
    return undefined;
  }

  return {
    has,
    rankOf,
    findNearMiss,
    findRecombination,
    findScopedLookalike,
    size: rank.size,
  };
}

export const defaultCorpus: PopularCorpus = buildCorpus(POPULAR_NAMES);
export { POPULAR_META };
