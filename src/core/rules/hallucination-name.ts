import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";
import { nameSignalBasis, rateNameSignal } from "./name-signal.js";

/**
 * A name that recombines the tokens of a real popular package, the slopsquat
 * pattern where an AI assistant invents a plausible name by reordering tokens or
 * dropping an ecosystem convention affix (unused-imports for
 * eslint-plugin-unused-imports). Unlike typosquat this is not about edit
 * distance; the tokens match a real package but the exact name does not exist as
 * published. Eligibility and risk rating are the shared name-signal policy
 * (`name-signal.ts`), so an established package that merely shares tokens is
 * never flagged. Cross-package blends where a token is itself novel
 * (react-codeshift) are out of scope and fall to nonexistent-package.
 */
export function createHallucinationNameDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "hallucination-name",
    description: "Flags names that recombine the tokens of a popular package (slopsquat pattern).",
    detect(pkg: PackageFacts): Finding[] {
      const basis = nameSignalBasis(pkg, corpus.has(pkg.name));
      if (basis === "skip") return [];

      const match = corpus.findRecombination(pkg.name);
      if (!match) return [];

      const how =
        match.kind === "affix-drop"
          ? `drops the convention prefix of "${match.victim}"`
          : `reorders the tokens of "${match.victim}"`;
      const detail = `This name ${how}, a popular package, but is not itself that package. AI assistants hallucinate plausible names like this, and attackers register them. Confirm you did not mean "${match.victim}".`;
      const baseEvidence = `token match to "${match.victim}" (popularity rank ${match.rank + 1}), ${match.kind}`;
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
        title: "Name looks like a recombination of a popular package",
        detail,
        evidence,
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      });

      if (basis === "offline") {
        // No existence or adoption facts offline: the lowest honest tier.
        return [
          make("low", "low", `${baseEvidence}; existence and adoption unverified (offline scan)`),
        ];
      }

      const rating = rateNameSignal(pkg);
      if (!rating) return [];

      return [make(rating.severity, rating.confidence, baseEvidence)];
    },
  };
}

export const hallucinationName = createHallucinationNameDetector();
