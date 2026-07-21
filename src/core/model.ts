/**
 * Core data model. These types are the contract between collectors (which do
 * all IO) and detectors (pure functions that judge). Nothing here does IO.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";

/** How sure we are the finding is real, distinct from how bad it would be. */
export type Confidence = "high" | "medium" | "low";

/** How a package entered the dependency graph, so findings can be traced back. */
export type DependencyKind = "prod" | "dev" | "peer" | "optional" | "bundled" | "transitive";

/** How the version was specified, which decides what we can verify about it. */
export type DependencySource =
  "registry" | "git" | "file" | "link" | "alias" | "workspace" | "unknown";

/**
 * The facts a collector gathers about one resolved dependency. Detectors read
 * these; they never reach out to the network or filesystem themselves. Fields
 * are optional because a fact may be genuinely unknowable (offline, private
 * registry, git dependency), and "unknown" must never be treated as "safe".
 */
export interface PackageFacts {
  name: string;
  /** Resolved version from the lockfile, if any. */
  version?: string;
  requestedRange?: string;
  kind: DependencyKind;
  source: DependencySource;
  /** Whether the registry has any record of this name at all. */
  existsOnRegistry?: boolean;
  /**
   * When existence is unknown, why: the registry was deliberately not consulted
   * (`offline`) or a lookup failed (`error`). Lets a detector offer an
   * offline-only heuristic without firing on a transient online failure.
   */
  existenceUnverifiedReason?: "offline" | "error";
  /** Whether this exact version is still published. */
  versionPublished?: boolean;
  firstPublishAt?: string;
  latestPublishAt?: string;
  /** Days since the package name was first published, computed at collection time. */
  ageDays?: number;
  /** Number of published versions of this name. */
  versionCount?: number;
  weeklyDownloads?: number;
  hasInstallScript?: boolean;
  repositoryUrl?: string;
  integrity?: string;
  resolvedUrl?: string;
  /** Where this fact set came from, for traceable verdicts. */
  evidencePath?: string;
}

/** A single detector result. Evidence is always quoted, never live content. */
export interface Finding {
  ruleId: string;
  severity: Severity;
  confidence: Confidence;
  packageName: string;
  packageVersion?: string;
  title: string;
  /** One line: why this matters. */
  detail: string;
  /** Concrete, escaped, truncated evidence backing the finding. */
  evidence?: string;
  location?: string;
}

/** A pure detector: facts in, findings out. No IO, no side effects. */
export interface Detector {
  id: string;
  description: string;
  detect(pkg: PackageFacts): Finding[];
}

/**
 * A configured suppression. A finding matching `rule` and `package` is not
 * counted toward the verdict, but is still reported as suppressed. The reason
 * is mandatory: a suppression the team cannot explain is a suppression that
 * should not exist.
 */
export interface IgnoreRule {
  rule: string;
  package: string;
  reason: string;
}

/** A finding that matched an ignore rule; shown as suppressed, never hidden. */
export type SuppressedFinding = Finding & { suppressedReason: string };

/**
 * One entry in a recorded baseline. A finding matching a baseline entry is
 * pre-existing (it was present when the baseline was taken) and is reported as
 * suppressed rather than failing the build; only findings absent from the
 * baseline are new. Matched by rule, package, and exact version.
 */
export interface BaselineEntry {
  rule: string;
  package: string;
  version?: string;
}

export type ScanVerdict = "clean" | "findings" | "could-not-verify";

export interface Report {
  verdict: ScanVerdict;
  target: string;
  ecosystem: string;
  packagesScanned: number;
  findings: Finding[];
  /** Findings suppressed by a configured ignore rule; do not affect the verdict. */
  suppressed?: SuppressedFinding[];
  /** Packages we could not fully verify (offline, unsupported source, etc.). */
  unverified: string[];
  generatedAt: string;
  /** Whether the scan read a resolved lockfile tree or only the manifest. */
  basis?: "lockfile" | "manifest";
  /** Non-fatal notices, e.g. an unsupported lockfile that forced a manifest fallback. */
  warnings?: string[];
}

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};
