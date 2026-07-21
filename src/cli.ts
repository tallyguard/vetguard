#!/usr/bin/env node
import { parseArgs } from "node:util";
import process from "node:process";
import type { Report, Severity } from "./core/model.js";
import { scanProject, checkPackage } from "./scan.js";
import { renderTerminal } from "./output/terminal.js";
import { renderJson } from "./output/json.js";
import { resolveExitCode } from "./output/exit-code.js";
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
  --json                     Print the report as JSON instead of text.
  --fail-on <severity>       Exit non-zero only when a finding at or above this
                             severity exists (critical|high|medium|low|info).
                             Default: any finding exits non-zero.

vetguard never executes the code it scans. When it cannot verify something it
says so rather than calling it safe.`;

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

interface RunOptions {
  offline: boolean;
  json: boolean;
  failOn: Severity | undefined;
}

async function main(argv: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      offline: { type: "boolean" },
      json: { type: "boolean" },
      "fail-on": { type: "string" },
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

  const failOnRaw = values["fail-on"];
  if (failOnRaw !== undefined && !SEVERITIES.includes(failOnRaw as Severity)) {
    console.error(`Invalid --fail-on value: ${failOnRaw} (expected ${SEVERITIES.join(", ")})`);
    return 2;
  }

  const options: RunOptions = {
    offline: values.offline === true,
    json: values.json === true,
    failOn: failOnRaw as Severity | undefined,
  };

  if (command === "scan") {
    return runScan(positionals[1] ?? process.cwd(), options);
  }
  if (command === "check") {
    const spec = positionals[1];
    if (spec === undefined) {
      console.error("check requires a package name, e.g. vetguard check express\n");
      console.error(HELP);
      return 2;
    }
    return runCheck(spec, options);
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  return 2;
}

async function runScan(dir: string, options: RunOptions): Promise<number> {
  let report: Report;
  try {
    report = await scanProject(dir, { offline: options.offline });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  return emit(report, options);
}

async function runCheck(specInput: string, options: RunOptions): Promise<number> {
  const report = await checkPackage(specInput, { offline: options.offline });
  return emit(report, options);
}

function emit(report: Report, options: RunOptions): number {
  console.log(options.json ? renderJson(report, VERSION) : renderTerminal(report));
  return resolveExitCode(report, options.failOn);
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  });
