import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";

export const HALLUCINATION_POPULAR_FLOOR = 15_000;
export const HALLUCINATION_LOW_DOWNLOADS = 100;
export const HALLUCINATION_YOUNG_DAYS = 30;

/**
 * A name that recombines the tokens of a real popular package, the slopsquat
 * pattern where an AI assistant invents a plausible name by reordering tokens or
 * dropping an ecosystem convention affix (unused-imports for
 * eslint-plugin-unused-imports). Unlike typosquat this is not about edit
 * distance; the tokens match a real package but the exact name does not exist as
 * published. Like every name signal it is a gate: it becomes a finding only when
 * the suspect is nonexistent, young, or low-adoption, never on an established
 * package that merely shares tokens. Cross-package blends where a token is
 * itself novel (react-codeshift) are out of scope and fall to nonexistent-package.
 *
 * Scoped names are skipped: scopes are ownership-gated.
 */
export function createHallucinationNameDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "hallucination-name",
    description: "Flags names that recombine the tokens of a popular package (slopsquat pattern).",
    detect(pkg: PackageFacts): Finding[] {
      if (pkg.source !== "registry") return [];
      if (pkg.name.startsWith("@")) return [];
      if (corpus.has(pkg.name)) return [];
      if (pkg.existsOnRegistry === undefined) return [];

      const match = corpus.findRecombination(pkg.name);
      if (!match) return [];

      const downloads = pkg.weeklyDownloads;
      const established = downloads !== undefined && downloads >= HALLUCINATION_POPULAR_FLOOR;
      if (pkg.existsOnRegistry === true && established) return [];

      let severity: Finding["severity"];
      let confidence: Confidence;
      if (pkg.existsOnRegistry === false) {
        severity = "high";
        confidence = "high";
      } else {
        const young = pkg.ageDays !== undefined && pkg.ageDays <= HALLUCINATION_YOUNG_DAYS;
        const veryLow = downloads !== undefined && downloads < HALLUCINATION_LOW_DOWNLOADS;
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

      const how =
        match.kind === "affix-drop"
          ? `drops the convention prefix of "${match.victim}"`
          : `reorders the tokens of "${match.victim}"`;

      return [
        {
          ruleId: this.id,
          severity,
          confidence,
          packageName: pkg.name,
          ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
          title: "Name looks like a recombination of a popular package",
          detail: `This name ${how}, a popular package, but is not itself that package. AI assistants hallucinate plausible names like this, and attackers register them. Confirm you did not mean "${match.victim}".`,
          evidence: `token match to "${match.victim}" (popularity rank ${match.rank + 1}), ${match.kind}`,
          ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
        },
      ];
    },
  };
}

export const hallucinationName = createHallucinationNameDetector();
