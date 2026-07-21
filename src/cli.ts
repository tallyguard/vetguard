#!/usr/bin/env node
import { parseArgs } from "node:util";
import process from "node:process";
import { runDetectors } from "./core/engine.js";
import { builtinDetectors } from "./core/rules/index.js";
import type { PackageFacts } from "./core/model.js";
import { readManifestFacts } from "./ecosystems/npm/manifest.js";
import { renderTerminal } from "./output/terminal.js";
import { VERSION } from "./index.js";

const HELP = `vetguard ${VERSION} - scan npm dependencies for AI-era supply-chain threats

Usage:
  vetguard scan [dir]     Scan a project's dependencies (defaults to cwd)
  vetguard --help         Show this help
  vetguard --version      Show version

Phase 0: manifest parsing and the detector pipeline are wired end to end.
Registry checks, lockfile resolution, and deep analysis land in later phases,
so registry-sourced packages currently report as "could not verify" rather
than "clean". This is intentional: unverified is never reported as safe.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.version) {
    console.log(VERSION);
    return 0;
  }

  const command = positionals[0];
  if (values.help || command === undefined || command === "help") {
    console.log(HELP);
    return 0;
  }

  if (command === "scan") {
    const dir = positionals[1] ?? process.cwd();
    return runScan(dir);
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  return 2;
}

async function runScan(dir: string): Promise<number> {
  let facts: PackageFacts[];
  try {
    facts = await readManifestFacts(dir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  // Until the registry client lands, any registry-sourced package is unverified
  // rather than silently assumed present.
  const unverified = facts
    .filter((f) => f.source === "registry" && f.existsOnRegistry === undefined)
    .map((f) => f.name);

  const report = runDetectors(facts, builtinDetectors, {
    target: dir,
    ecosystem: "npm",
    unverified,
    generatedAt: new Date().toISOString(),
  });

  console.log(renderTerminal(report));
  return report.verdict === "findings" ? 1 : 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  });
