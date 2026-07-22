/**
 * Accuracy evaluation harness (release gate). Runs the registered detectors
 * offline against the bundled popular-package corpus to catch accuracy
 * regressions deterministically and network-free:
 *
 *   - the top-N popular packages must produce ZERO findings (false-positive guard)
 *   - a labeled positive corpus of name-resemblance cases must each flag with the
 *     expected rule (true-positive guard)
 *
 * Exit non-zero (stop-the-line) on any false positive or missed positive. The
 * network-dependent detectors (nonexistent-package, unpublished-version,
 * known-cve) are covered by unit tests and the live smoke, not here; this harness
 * guards the offline-capable name detectors, which are the false-positive-prone
 * ones and the ones the corpus can exercise without a network.
 */
import { builtinDetectors } from "../src/core/rules/index.js";
import { POPULAR_META } from "../src/ecosystems/npm/popular.js";
import { POPULAR_NAMES } from "../src/ecosystems/npm/data/popular-packages.js";
import type { Finding, PackageFacts } from "../src/core/model.js";

const TOP_N = 1000;

/**
 * Name-resemblance cases that must flag with the given rule, offline, against the
 * bundled corpus. Hand-curated; add a case when a real slopsquat or typosquat
 * pattern is documented (a missing flag here is a regression).
 */
const POSITIVES: { name: string; rule: string; note: string }[] = [
  { name: "lodahs", rule: "typosquat", note: "transposition of lodash" },
  { name: "expres", rule: "typosquat", note: "deletion of express" },
  { name: "reactt", rule: "typosquat", note: "insertion of react" },
  { name: "chakl", rule: "typosquat", note: "transposition of chalk" },
  {
    name: "unused-imports",
    rule: "hallucination-name",
    note: "affix-drop of eslint-plugin-unused-imports",
  },
  { name: "dom-react-router", rule: "hallucination-name", note: "reorder of react-router-dom" },
];

function offlineFact(name: string): PackageFacts {
  return { name, kind: "prod", source: "registry", existenceUnverifiedReason: "offline" };
}

function detect(name: string): Finding[] {
  const fact = offlineFact(name);
  return builtinDetectors.flatMap((d) => d.detect(fact));
}

const topNames = POPULAR_NAMES.slice(0, TOP_N);
const falsePositives: { name: string; rules: string[] }[] = [];
for (const name of topNames) {
  const findings = detect(name);
  if (findings.length > 0) {
    falsePositives.push({ name, rules: [...new Set(findings.map((f) => f.ruleId))] });
  }
}

const misses: typeof POSITIVES = [];
for (const p of POSITIVES) {
  const findings = detect(p.name);
  if (!findings.some((f) => f.ruleId === p.rule)) misses.push(p);
}

console.log("vetguard accuracy evaluation");
console.log(
  `corpus: ${POPULAR_META.source} ${POPULAR_META.sourceVersion} (${POPULAR_META.count} names)`,
);
console.log(`false positives on top ${TOP_N} popular packages: ${falsePositives.length}`);
console.log(`labeled positives flagged: ${POSITIVES.length - misses.length}/${POSITIVES.length}`);

if (falsePositives.length > 0) {
  console.log("\nFALSE POSITIVES (a popular package must never flag):");
  for (const fp of falsePositives) console.log(`  ${fp.name} -> ${fp.rules.join(", ")}`);
}
if (misses.length > 0) {
  console.log("\nMISSED POSITIVES (should have flagged):");
  for (const m of misses) console.log(`  ${m.name} (expected ${m.rule}: ${m.note})`);
}

const pass = falsePositives.length === 0 && misses.length === 0;
console.log(`\n${pass ? "PASS" : "FAIL"}`);
process.exit(pass ? 0 : 1);
