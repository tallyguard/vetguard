import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";
import { nameSignalBasis, rateNameSignal } from "./name-signal.js";

/**
 * An unscoped dependency name that is a dropped-scope lookalike of a popular
 * scoped package (bare `babel-core` for `@babel/core`). Attackers register the
 * unscoped form to catch installs that dropped the `@scope/`. Only the risky
 * direction is judged: the suspect is unscoped and NOT itself a corpus member.
 * Eligibility and risk rating are the shared name-signal policy
 * (`name-signal.ts`), so an established package that happens to match (a real
 * legacy unscoped form) is left alone. The scoped package itself and the
 * ownership-gated `@types` scope are never suspects.
 */
export function createScopedLookalikeDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "scoped-lookalike",
    description:
      "Flags unscoped names that resemble a popular scoped package (dropped-scope lookalike).",
    detect(pkg: PackageFacts): Finding[] {
      const basis = nameSignalBasis(pkg, corpus.has(pkg.name));
      if (basis === "skip") return [];

      const match = corpus.findScopedLookalike(pkg.name);
      if (!match) return [];

      const detail = `This unscoped name resembles the popular scoped package "${match.target}". Attackers register the unscoped form to catch installs that dropped the "@scope/". Confirm you meant "${match.target}".`;
      const baseEvidence = `resembles scoped package "${match.target}" (popularity rank ${match.rank + 1}), dropped scope`;
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
        title: "Name resembles a popular scoped package",
        detail,
        evidence,
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      });

      if (basis === "offline") {
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

export const scopedLookalike = createScopedLookalikeDetector();
