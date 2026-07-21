import type { Detector, Finding, PackageFacts } from "../model.js";

/**
 * The package name exists on the registry, but the exact version pinned here is
 * not published. npm unpublishes versions when it removes malware, so a
 * dependency pinned to a version the registry no longer serves is a strong
 * tamper or removed-malware signal (it can also be a typo'd version). Only
 * fires when a concrete version was checked and the registry authoritatively
 * lacks it, never on a version we could not resolve.
 */
export const unpublishedVersion: Detector = {
  id: "unpublished-version",
  description: "Flags a pinned version that is not published on the registry.",
  detect(pkg: PackageFacts): Finding[] {
    if (pkg.existsOnRegistry !== true) return [];
    if (pkg.versionPublished !== false) return [];

    return [
      {
        ruleId: this.id,
        severity: "high",
        confidence: "high",
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: "Pinned version is not published on the registry",
        detail:
          "The package exists but this exact version is not on the registry. Versions disappear when npm removes malware or a publisher unpublishes; installing a version the registry does not serve is unsafe. Confirm the intended version.",
        ...(pkg.version === undefined
          ? {}
          : { evidence: `version ${pkg.version} not found on registry` }),
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      },
    ];
  },
};
