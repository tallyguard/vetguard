import type { Detector, Finding, PackageFacts } from "../model.js";

/**
 * A dependency whose name has no record on the registry. For a registry-sourced
 * dependency this is the clearest slopsquatting signal there is: the package an
 * AI told you to install does not exist, which is exactly the window an attacker
 * registers into. Only fires when we actually reached the registry and it said
 * no; an unknown existence state produces nothing (honest degradation).
 */
export const nonexistentPackage: Detector = {
  id: "nonexistent-package",
  description: "Flags registry dependencies that do not exist on the registry.",
  detect(pkg: PackageFacts): Finding[] {
    if (pkg.source !== "registry") return [];
    if (pkg.existsOnRegistry !== false) return [];

    return [
      {
        ruleId: this.id,
        severity: "high",
        confidence: "high",
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: "Dependency does not exist on the registry",
        detail:
          "The registry has no record of this package name. AI assistants routinely hallucinate package names, and attackers register the predictable ones. Confirm the intended package before installing.",
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      },
    ];
  },
};
