import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";
import { nameSignalBasis, rateNameSignal } from "./name-signal.js";

const CONFIDENT_TRANSFORMS = new Set(["transposition", "substitution-adjacent"]);

function bump(confidence: Confidence): Confidence {
  return confidence === "low" ? "medium" : "high";
}

/**
 * A dependency name that is a near-miss of a popular package. Eligibility and
 * risk rating are the shared name-signal policy (`name-signal.ts`); this
 * detector supplies only the similarity match and the one thing specific to it,
 * a confidence bump when the edit is a transform typists actually make.
 *
 * Scoped names (@scope/name) are skipped by that policy: scopes are
 * ownership-gated and the risky direction (an unscoped look-alike of a scoped
 * package) belongs to the scoped-lookalike detector.
 */
export function createTyposquatDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "typosquat",
    description: "Flags dependency names that closely resemble a popular package.",
    detect(pkg: PackageFacts): Finding[] {
      const basis = nameSignalBasis(pkg, corpus.has(pkg.name));
      if (basis === "skip") return [];

      const near = corpus.findNearMiss(pkg.name);
      if (!near) return [];

      const detail = `This name differs from the popular package "${near.target}" by a single ${near.transform}. Attackers register look-alikes to catch typos and hallucinated names. Confirm you meant this package and not "${near.target}".`;
      const baseEvidence = `resembles "${near.target}" (popularity rank ${near.rank + 1}) via ${near.transform}`;
      const make = (
        severity: Finding["severity"],
        confidence: Confidence,
        evidence: string,
      ): Finding => ({
        ruleId: this.id,
        severity,
        confidence,
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: "Name closely resembles a popular package",
        detail,
        evidence,
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      });

      if (basis === "offline") {
        // No existence or adoption facts offline: the lowest honest tier, and
        // the confident-transform bump below is deliberately not applied.
        return [
          make("low", "low", `${baseEvidence}; existence and adoption unverified (offline scan)`),
        ];
      }

      const rating = rateNameSignal(pkg);
      if (!rating) return [];

      const confidence =
        CONFIDENT_TRANSFORMS.has(near.transform) && rating.confidence !== "high"
          ? bump(rating.confidence)
          : rating.confidence;

      return [make(rating.severity, confidence, baseEvidence)];
    },
  };
}

export const typosquat = createTyposquatDetector();
