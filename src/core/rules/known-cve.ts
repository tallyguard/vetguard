import type { Detector, Finding, PackageFacts } from "../model.js";

/**
 * A dependency whose exact resolved version has a known advisory (CVE/GHSA) per
 * OSV. This is the "does it have a known CVE?" check standard scanners do;
 * vetguard adds it as table stakes. One finding per advisory keeps each id, url,
 * and severity independently traceable. Severity is the advisory's own, mapped
 * to our scale; a known advisory whose magnitude the source did not rate is
 * reported at medium rather than dropped or guessed high.
 *
 * Reads only `pkg.knownVulnerabilities`: `undefined` (not checked) and `[]`
 * (checked, clean) both produce nothing. The collector establishes the fact;
 * this detector only shapes findings, so it stays pure.
 */
export const knownCve: Detector = {
  id: "known-cve",
  description:
    "Flags dependencies with known advisories (CVE/GHSA) affecting the resolved version.",
  detect(pkg: PackageFacts): Finding[] {
    const advisories = pkg.knownVulnerabilities;
    if (!advisories || advisories.length === 0) return [];

    const version = pkg.version ? `@${pkg.version}` : "";
    return advisories.map((adv) => {
      const aliasNote = adv.aliases && adv.aliases.length > 0 ? ` (${adv.aliases.join(", ")})` : "";
      const unrated = adv.severitySource === "floor";
      return {
        ruleId: this.id,
        severity: adv.severity,
        confidence: "high",
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: `Known vulnerability (${adv.id})`,
        detail: `OSV advisory ${adv.id} affects ${pkg.name}${version} (${adv.severity}${unrated ? ", severity not rated by the source" : ""}). Review and upgrade to a patched version.`,
        evidence: `${adv.id}${aliasNote}; severity ${adv.severity} via ${adv.severitySource}; ${adv.url}${adv.summary ? `; ${adv.summary}` : ""}`,
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      } satisfies Finding;
    });
  },
};
