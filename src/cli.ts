#!/usr/bin/env node
import { parseArgs } from "node:util";
import process from "node:process";
import { runDetectors } from "./core/engine.js";
import { builtinDetectors } from "./core/rules/index.js";
import type { PackageFacts, Report } from "./core/model.js";
import { readManifestFacts } from "./ecosystems/npm/manifest.js";
import { enrichWithRegistry } from "./ecosystems/npm/enrich.js";
import { createRegistryClient } from "./ecosystems/npm/registry.js";
import { parsePackageSpec } from "./ecosystems/npm/spec.js";
import { renderTerminal } from "./output/terminal.js";
import { VERSION } from "./index.js";

const HELP = `vetguard ${VERSION} - scan npm dependencies for AI-era supply-chain threats

Usage:
  vetguard scan [dir]        Scan a project's dependencies (defaults to cwd)
  vetguard check <pkg>       Vet a single package before installing
                             (e.g. vetguard check react-codeshift, foo@1.2.3)
  vetguard --help            Show this help
  vetguard --version         Show version

Options:
  --offline                  Do not contact the registry; unverifiable facts
                             are reported as "could not verify", never "safe".

vetguard never executes the code it scans. When it cannot verify something it
says so rather than calling it safe.`;

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      offline: { type: "boolean" },
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

  const offline = values.offline === true;

  if (command === "scan") {
    return runScan(positionals[1] ?? process.cwd(), offline);
  }
  if (command === "check") {
    const spec = positionals[1];
    if (spec === undefined) {
      console.error("check requires a package name, e.g. vetguard check express\n");
      console.error(HELP);
      return 2;
    }
    return runCheck(spec, offline);
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  return 2;
}

async function runScan(dir: string, offline: boolean): Promise<number> {
  let manifestFacts: PackageFacts[];
  try {
    manifestFacts = await readManifestFacts(dir);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const client = createRegistryClient({ offline });
  const { facts, unverified } = await enrichWithRegistry(manifestFacts, client);

  const report = runDetectors(facts, builtinDetectors, {
    target: dir,
    ecosystem: "npm",
    unverified,
    generatedAt: new Date().toISOString(),
  });

  console.log(renderTerminal(report));
  return exitCodeFor(report);
}

async function runCheck(specInput: string, offline: boolean): Promise<number> {
  const spec = parsePackageSpec(specInput);
  const base: PackageFacts = {
    name: spec.name,
    ...(spec.version === undefined ? {} : { version: spec.version }),
    kind: "prod",
    source: "registry",
  };

  const client = createRegistryClient({ offline });
  const { facts, unverified } = await enrichWithRegistry([base], client);

  const report = runDetectors(facts, builtinDetectors, {
    target: specInput,
    ecosystem: "npm",
    unverified,
    generatedAt: new Date().toISOString(),
  });

  console.log(renderTerminal(report));
  return exitCodeFor(report);
}

function exitCodeFor(report: Report): number {
  return report.verdict === "findings" ? 1 : 0;
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  });
