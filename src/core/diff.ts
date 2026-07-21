import type { PackageFacts } from "./model.js";

/**
 * Identity of a resolved dependency: name, exact version, and where its bytes
 * come from (integrity hash, else resolved URL, else source kind). Keying on
 * the resolved identity, not just name@version, is what makes a same-version
 * repoint visible: a lockfile that keeps `left-pad@1.3.0` but swaps its
 * `resolved`/`integrity` to a malicious source is a change npm ci honors, and
 * dropping it would let the diff report "nothing changed".
 */
function key(fact: PackageFacts): string {
  const origin = fact.integrity ?? fact.resolvedUrl ?? fact.source ?? "";
  return `${fact.name}@${fact.version ?? ""}#${origin}`;
}

/**
 * The facts present in `head` but not in `base`, keyed by resolved identity.
 * This is every dependency a change introduces: a brand-new name, a new
 * version, a downgrade, and a same-version repoint (changed integrity or
 * resolved URL). An identical entry in both is dropped, so a diff scan judges
 * only what the change actually adds.
 */
export function introducedFacts(
  base: readonly PackageFacts[],
  head: readonly PackageFacts[],
): PackageFacts[] {
  const baseKeys = new Set(base.map(key));
  return head.filter((fact) => !baseKeys.has(key(fact)));
}
