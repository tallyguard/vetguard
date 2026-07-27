import type { Confidence, PackageFacts, Severity } from "../model.js";

/**
 * Shared risk gating for the name-resemblance detectors (typosquat,
 * hallucination-name, scoped-lookalike). Each of those finds a different kind
 * of resemblance, but the question of whether a resemblance is worth reporting,
 * and how loudly, is one policy. Keeping it here means a threshold change lands
 * once instead of three times, and the three detectors cannot silently drift
 * apart on what counts as an established package.
 *
 * Pure: facts in, rating out. No IO, no corpus.
 */

/** Weekly downloads at or above which a suspect is established, not a squat. */
const POPULAR_FLOOR = 15_000;

/** Weekly downloads below which adoption is too thin to explain a resemblance away. */
const LOW_DOWNLOADS = 100;

/** Days since first publish at or under which a name counts as freshly registered. */
const YOUNG_DAYS = 30;

/**
 * What evidence a name signal may be judged on. `offline` means existence was
 * deliberately not checked, so a corpus match can still be reported at the
 * lowest honest tier; a lookup that failed yields `skip`, because turning a
 * transient rate-limit into a finding is a false positive.
 */
export type NameSignalBasis = "skip" | "offline" | "online";

/**
 * Whether this package is eligible for name-resemblance analysis at all.
 * Scoped names are skipped: scopes are ownership-gated. A corpus member is
 * skipped because a popular name is never a squat of another popular name,
 * which is what keeps preact/react and color/colors from false-positiving.
 */
export function nameSignalBasis(pkg: PackageFacts, isCorpusMember: boolean): NameSignalBasis {
  if (pkg.source !== "registry") return "skip";
  if (pkg.name.startsWith("@")) return "skip";
  if (isCorpusMember) return "skip";
  if (pkg.existsOnRegistry !== undefined) return "online";
  return pkg.existenceUnverifiedReason === "offline" ? "offline" : "skip";
}

/**
 * Rates a confirmed resemblance from the risk facts, never from how close the
 * names look: name similarity is the gate, the facts set the verdict. Returns
 * undefined when the suspect is itself established, which is corpus staleness
 * or a real legacy package rather than a squat.
 *
 * Only valid on the `online` basis, where existence is known either way.
 */
export function rateNameSignal(
  pkg: PackageFacts,
): { severity: Severity; confidence: Confidence } | undefined {
  const downloads = pkg.weeklyDownloads;
  const established = downloads !== undefined && downloads >= POPULAR_FLOOR;
  if (pkg.existsOnRegistry === true && established) return undefined;

  if (pkg.existsOnRegistry === false) return { severity: "high", confidence: "high" };

  const young = pkg.ageDays !== undefined && pkg.ageDays <= YOUNG_DAYS;
  const veryLow = downloads !== undefined && downloads < LOW_DOWNLOADS;
  if (young || veryLow) return { severity: "high", confidence: "medium" };
  if (downloads !== undefined) return { severity: "medium", confidence: "medium" };
  return { severity: "low", confidence: "low" };
}
