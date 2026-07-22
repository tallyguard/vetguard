#!/usr/bin/env node
import { parseArgs } from "node:util";
import process from "node:process";
import type { Report, Severity } from "./core/model.js";
import { scanProject, checkPackage, diffScan, type ScanOptions } from "./scan.js";
import { loadConfig, ConfigError } from "./config.js";
import { readBaseline, writeBaseline, BaselineError } from "./baseline-io.js";
import { toBaselineEntries } from "./core/baseline.js";
import { renderTerminal } from "./output/terminal.js";
import { renderJson } from "./output/json.js";
import { renderSarif } from "./output/sarif.js";
import { renderMarkdown } from "./output/markdown.js";
import { resolveExitCode } from "./output/exit-code.js";
import { VERSION } from "./index.js";

const HELP = `vetguard ${VERSION} - scan npm dependencies for AI-era supply-chain threats

Usage:
  vetguard scan [dir]        Scan a project's dependencies (defaults to cwd)
  vetguard check <pkg>       Vet a single package before installing
                             (e.g. vetguard check react-codeshift, foo@1.2.3)
  vetguard diff --base <lockfile> [--head <lockfile>]
                             Scan only the dependencies a change introduces
                             (head defaults to ./package-lock.json)
  vetguard baseline [dir]    Record current findings to .vetguard-baseline.json;
                             later scans report those as baselined and fail only
                             on new findings (adopt on a messy repo, ratchet down)
  vetguard --help            Show this help
  vetguard --version         Show version

Options:
  --offline                  Do not contact the registry or OSV advisory API;
                             unverifiable facts are reported as "could not
                             verify", never "safe".
  --json                     Print the report as JSON.
  --sarif                    Print SARIF 2.1.0 for GitHub code scanning.
  --markdown                 Print compact markdown for a PR comment or summary.
  --quiet                    Print only findings and the verdict.
  --no-color                 Disable ANSI colors (also respects NO_COLOR).
  --fail-on <severity>       Exit non-zero only when a finding at or above this
                             severity exists (critical|high|medium|low|info).
                             Default: any finding exits non-zero.

vetguard never executes the code it scans. When it cannot verify something it
says so rather than calling it safe.`;

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low", "info"];

interface RunOptions {
  offline: boolean;
  json: boolean;
  sarif: boolean;
  markdown: boolean;
  quiet: boolean;
  color: boolean;
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
      sarif: { type: "boolean" },
      markdown: { type: "boolean" },
      quiet: { type: "boolean" },
      "no-color": { type: "boolean" },
      "fail-on": { type: "string" },
      base: { type: "string" },
      head: { type: "string" },
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

  const color =
    process.stdout.isTTY === true &&
    !process.env.NO_COLOR &&
    values["no-color"] !== true &&
    values.json !== true &&
    values.sarif !== true &&
    values.markdown !== true;

  const options: RunOptions = {
    offline: values.offline === true,
    json: values.json === true,
    sarif: values.sarif === true,
    markdown: values.markdown === true,
    quiet: values.quiet === true,
    color,
    failOn: failOnRaw as Severity | undefined,
  };

  if (command === "scan") {
    const dir = positionals[1] ?? process.cwd();
    return runReport(dir, options, (opts) => scanProject(dir, opts), dir);
  }
  if (command === "baseline") {
    return runBaseline(positionals[1] ?? process.cwd(), options);
  }
  if (command === "check") {
    const spec = positionals[1];
    if (spec === undefined) {
      console.error("check requires a package name, e.g. vetguard check express\n");
      console.error(HELP);
      return 2;
    }
    return runReport(process.cwd(), options, (opts) => checkPackage(spec, opts));
  }
  if (command === "diff") {
    if (values.base === undefined) {
      console.error("diff requires --base <lockfile> (the base package-lock.json)\n");
      console.error(HELP);
      return 2;
    }
    const head = values.head ?? "package-lock.json";
    return runReport(process.cwd(), options, (opts) => diffScan(values.base as string, head, opts));
  }

  console.error(`Unknown command: ${command}\n`);
  console.error(HELP);
  return 2;
}

/**
 * Loads config from `configDir`, merges it under the CLI flags (flags win),
 * then produces and renders the report. A config-file error exits 2 rather
 * than scanning with a half-understood configuration.
 */
async function runReport(
  configDir: string,
  cli: RunOptions,
  produce: (options: ScanOptions) => Promise<Report>,
  baselineDir?: string,
): Promise<number> {
  let scanOptions: ScanOptions;
  let failOn: Severity | undefined;
  try {
    const config = await loadConfig(configDir);
    const baseline = baselineDir ? await readBaseline(baselineDir) : undefined;
    failOn = cli.failOn ?? config?.failOn;
    scanOptions = {
      offline: cli.offline || config?.offline === true,
      ...(config?.ignore ? { ignore: config.ignore } : {}),
      ...(baseline ? { baseline } : {}),
    };
  } catch (err) {
    if (err instanceof ConfigError || err instanceof BaselineError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }

  let report: Report;
  try {
    report = await produce(scanOptions);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }
  console.log(render(report, cli));
  return resolveExitCode(report, failOn);
}

/**
 * Records the current active findings as the baseline. Config ignores still
 * apply (already-suppressed findings are not baselined), but an existing
 * baseline is not applied, so the snapshot captures everything the next scan
 * would otherwise flag.
 */
async function runBaseline(dir: string, cli: RunOptions): Promise<number> {
  let scanOptions: ScanOptions;
  try {
    const config = await loadConfig(dir);
    scanOptions = {
      offline: cli.offline || config?.offline === true,
      ...(config?.ignore ? { ignore: config.ignore } : {}),
    };
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      return 2;
    }
    throw err;
  }

  let report: Report;
  try {
    report = await scanProject(dir, scanOptions);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    return 2;
  }

  const entries = toBaselineEntries(report.findings);
  const filePath = await writeBaseline(dir, entries, new Date().toISOString());
  console.log(
    `Recorded ${entries.length} finding(s) to ${filePath}. Future scans report these as baselined and fail only on new findings.`,
  );
  return 0;
}

function render(report: Report, options: RunOptions): string {
  if (options.sarif) return renderSarif(report, VERSION);
  if (options.markdown) return renderMarkdown(report);
  if (options.json) return renderJson(report, VERSION);
  return renderTerminal(report, { color: options.color, quiet: options.quiet });
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack : String(err));
    process.exit(2);
  });
