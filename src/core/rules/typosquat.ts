import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";

/** Weekly downloads at or above which the suspect is treated as established (not a squat). */
export const TYPOSQUAT_POPULAR_FLOOR = 15_000;
export const TYPOSQUAT_LOW_DOWNLOADS = 100;
export const TYPOSQUAT_YOUNG_DAYS = 30;

const CONFIDENT_TRANSFORMS = new Set(["transposition", "substitution-adjacent"]);

function bump(confidence: Confidence): Confidence {
  return confidence === "low" ? "medium" : "high";
}

/**
 * A dependency name that is a near-miss of a popular package. The order of
 * operations is load-bearing: self-membership is checked FIRST (a popular name
 * is never a squat of another popular name, which is what keeps preact/react and
 * color/colors from false-positiving), then the name-similarity match is only
 * turned into a finding when the suspect is NOT itself established, so a busy,
 * widely-installed package that merely looks similar is not flagged. Name
 * similarity is a gate; severity comes from the risk facts, not the distance.
 *
 * Scoped names (@scope/name) are skipped in this detector: scopes are
 * ownership-gated and the risky direction (an unscoped look-alike of a scoped
 * package) is handled separately later.
 */
export function createTyposquatDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "typosquat",
    description: "Flags dependency names that closely resemble a popular package.",
    detect(pkg: PackageFacts): Finding[] {
      if (pkg.source !== "registry") return [];
      if (pkg.name.startsWith("@")) return [];
      if (corpus.has(pkg.name)) return [];
      // Honest degradation: without an existence fact we cannot judge.
      if (pkg.existsOnRegistry === undefined) return [];

      const near = corpus.findNearMiss(pkg.name);
      if (!near) return [];

      const downloads = pkg.weeklyDownloads;
      const established = downloads !== undefined && downloads >= TYPOSQUAT_POPULAR_FLOOR;
      // An established package missing from the corpus is corpus staleness, not a squat.
      if (pkg.existsOnRegistry === true && established) return [];

      let severity: Finding["severity"];
      let confidence: Confidence;
      if (pkg.existsOnRegistry === false) {
        severity = "high";
        confidence = "high";
      } else {
        const young = pkg.ageDays !== undefined && pkg.ageDays <= TYPOSQUAT_YOUNG_DAYS;
        const veryLow = downloads !== undefined && downloads < TYPOSQUAT_LOW_DOWNLOADS;
        if (young || veryLow) {
          severity = "high";
          confidence = "medium";
        } else if (downloads !== undefined) {
          severity = "medium";
          confidence = "medium";
        } else {
          severity = "low";
          confidence = "low";
        }
      }
      if (CONFIDENT_TRANSFORMS.has(near.transform) && confidence !== "high") {
        confidence = bump(confidence);
      }

      return [
        {
          ruleId: this.id,
          severity,
          confidence,
          packageName: pkg.name,
          ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
          title: "Name closely resembles a popular package",
          detail: `This name differs from the popular package "${near.target}" by a single ${near.transform}. Attackers register look-alikes to catch typos and hallucinated names. Confirm you meant this package and not "${near.target}".`,
          evidence: `resembles "${near.target}" (popularity rank ${near.rank + 1}) via ${near.transform}`,
          ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
        },
      ];
    },
  };
}

export const typosquat = createTyposquatDetector();
