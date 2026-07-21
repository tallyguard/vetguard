import type { Severity } from "../core/model.js";

const CODES = { red: 31, green: 32, yellow: 33, blue: 34, gray: 90, bold: 1 } as const;
type Color = keyof typeof CODES;

/** Wraps text in an ANSI color when enabled, otherwise returns it unchanged. */
export function paint(text: string, color: Color, enabled: boolean): string {
  return enabled ? `\x1b[${CODES[color]}m${text}\x1b[0m` : text;
}

const SEVERITY_COLOR: Record<Severity, Color> = {
  critical: "red",
  high: "red",
  medium: "yellow",
  low: "blue",
  info: "gray",
};

export function severityColor(severity: Severity): Color {
  return SEVERITY_COLOR[severity];
}
