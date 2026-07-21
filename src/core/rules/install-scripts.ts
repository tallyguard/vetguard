import type { Detector, Finding, PackageFacts } from "../model.js";

/**
 * A package that runs a lifecycle install script (preinstall / install /
 * postinstall) executes code on `npm install`, the classic backdoor and dropper
 * vector. Install scripts are also completely normal for many legitimate
 * packages (native builds, binary downloads), so this correlates the capability
 * with risk rather than flagging it outright: an established, widely-installed
 * package with an install script is expected and suppressed, while a fresh or
 * obscure package running install code is the profile that hides malware.
 */

export const INSTALL_SCRIPT_TRUST_DOWNLOADS = 10_000;
export const INSTALL_SCRIPT_YOUNG_DAYS = 30;
export const INSTALL_SCRIPT_LOW_DOWNLOADS = 100;
export const INSTALL_SCRIPT_ESTABLISHED_DAYS = 365;

export const installScripts: Detector = {
  id: "install-scripts",
  description: "Flags install lifecycle scripts on packages that are not well established.",
  detect(pkg: PackageFacts): Finding[] {
    if (pkg.hasInstallScript !== true) return [];
    // Only judge a package we actually confirmed on the registry; a package we
    // could not verify is handled by other rules, not asserted here.
    if (pkg.existsOnRegistry !== true) return [];

    const downloads = pkg.weeklyDownloads;

    // A widely-installed package running an install script is normal (native
    // builds, prebuilt binaries). When adoption is unmeasurable (the download
    // API rate-limits during a large scan), age stands in as the establishment
    // proxy so an old package is not flagged on missing data alone.
    const establishedByDownloads =
      downloads !== undefined && downloads >= INSTALL_SCRIPT_TRUST_DOWNLOADS;
    const oldWithUnknownAdoption =
      downloads === undefined &&
      pkg.ageDays !== undefined &&
      pkg.ageDays > INSTALL_SCRIPT_ESTABLISHED_DAYS;
    if (establishedByDownloads || oldWithUnknownAdoption) return [];

    const young = pkg.ageDays !== undefined && pkg.ageDays <= INSTALL_SCRIPT_YOUNG_DAYS;
    const lowDownloads = downloads !== undefined && downloads < INSTALL_SCRIPT_LOW_DOWNLOADS;
    const highRisk = young || lowDownloads;

    const evidenceParts: string[] = ["declares a preinstall/install/postinstall script"];
    if (pkg.ageDays !== undefined) evidenceParts.push(`first published ${pkg.ageDays} day(s) ago`);
    if (downloads !== undefined) evidenceParts.push(`~${downloads} weekly downloads`);
    else evidenceParts.push("adoption unknown");

    return [
      {
        ruleId: this.id,
        severity: highRisk ? "high" : "medium",
        confidence: downloads !== undefined || pkg.ageDays !== undefined ? "medium" : "low",
        packageName: pkg.name,
        ...(pkg.version === undefined ? {} : { packageVersion: pkg.version }),
        title: "Runs an install script and is not well established",
        detail:
          "Install lifecycle scripts execute code on install, the most common way supply-chain malware runs. This package is not widely adopted, so confirm the script is legitimate (a native build, not an obfuscated payload or a network call) before installing.",
        evidence: evidenceParts.join(", "),
        ...(pkg.evidencePath === undefined ? {} : { location: pkg.evidencePath }),
      },
    ];
  },
};
