import type { Detector, Finding, PackageFacts } from "../model.js";

/**
 * A recently first-published package with little adoption. Youth alone is not
 * malicious, plenty of legitimate packages are new, so this fires only when a
 * young name also has low or unknown download volume, which is the profile of
 * a fresh registration standing in for a name an AI assistant suggested. It is
 * a medium-severity prompt to look closer, not a block.
 */

export const YOUNG_AGE_DAYS = 30;
export const LOW_WEEKLY_DOWNLOADS = 100;

export const youngPackage: Detector = {
  id: "young-package",
  description: "Flags recently published packages with low or unknown adoption.",
  detect(pkg: PackageFacts): Finding[] {
    if (pkg.existsOnRegistry !== true) return [];
    if (pkg.ageDays === undefined || pkg.ageDays > YOUNG_AGE_DAYS) return [];

    // A young but already widely-installed package is not the risk profile here.
    if (pkg.weeklyDownloads !== undefined && pkg.weeklyDownloads >= LOW_WEEKLY_DOWNLOADS) {
      return [];
    }

    const downloadsKnown = pkg.weeklyDownloads !== undefined;
    const evidence = downloadsKnown
      ? `first published ${pkg.ageDays} day(s) ago, ~${pkg.weeklyDownloads} weekly downloads`
      : `first published ${pkg.ageDays} day(s) ago, download volume unknown`;

    return [
      {
        ruleId: this.id,
        severity: "medium",
        confidence: downloadsKnown ? "medium" : "low",
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: "Recently published package with little adoption",
        detail:
          "Newly registered, low-adoption packages are where supply-chain malware and slopsquats concentrate. Confirm this is the package you intended and not a fresh registration of a hallucinated or look-alike name.",
        evidence,
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      },
    ];
  },
};
