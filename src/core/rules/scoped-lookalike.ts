import type { Confidence, Detector, Finding, PackageFacts } from "../model.js";
import { defaultCorpus, type PopularCorpus } from "../../ecosystems/npm/popular.js";

export const SCOPED_POPULAR_FLOOR = 15_000;
export const SCOPED_LOW_DOWNLOADS = 100;
export const SCOPED_YOUNG_DAYS = 30;

/**
 * An unscoped dependency name that is a dropped-scope lookalike of a popular
 * scoped package (bare `babel-core` for `@babel/core`). Attackers register the
 * unscoped form to catch installs that dropped the `@scope/`. Only the risky
 * direction is judged: the suspect is unscoped and NOT itself a corpus member,
 * and the finding is risk-gated exactly like typosquat, so an established
 * package that happens to match (a real legacy unscoped form) is left alone. The
 * scoped package itself and the ownership-gated `@types` scope are never
 * suspects.
 */
export function createScopedLookalikeDetector(corpus: PopularCorpus = defaultCorpus): Detector {
  return {
    id: "scoped-lookalike",
    description:
      "Flags unscoped names that resemble a popular scoped package (dropped-scope lookalike).",
    detect(pkg: PackageFacts): Finding[] {
      if (pkg.source !== "registry") return [];
      if (pkg.name.startsWith("@")) return [];
      if (corpus.has(pkg.name)) return [];

      // Offline-capable: fire on a deliberate offline scan, never on a transient
      // registry failure (mirrors typosquat).
      const offline =
        pkg.existsOnRegistry === undefined && pkg.existenceUnverifiedReason === "offline";
      if (pkg.existsOnRegistry === undefined && !offline) return [];

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

      if (offline) {
        return [
          make("low", "low", `${baseEvidence}; existence and adoption unverified (offline scan)`),
        ];
      }

      const downloads = pkg.weeklyDownloads;
      const established = downloads !== undefined && downloads >= SCOPED_POPULAR_FLOOR;
      // An established package that merely matches is a real (often legacy) unscoped package, not a squat.
      if (pkg.existsOnRegistry === true && established) return [];

      let severity: Finding["severity"];
      let confidence: Confidence;
      if (pkg.existsOnRegistry === false) {
        severity = "high";
        confidence = "high";
      } else {
        const young = pkg.ageDays !== undefined && pkg.ageDays <= SCOPED_YOUNG_DAYS;
        const veryLow = downloads !== undefined && downloads < SCOPED_LOW_DOWNLOADS;
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
      return [make(severity, confidence, baseEvidence)];
    },
  };
}

export const scopedLookalike = createScopedLookalikeDetector();
