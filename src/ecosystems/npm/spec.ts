export interface PackageSpec {
  name: string;
  version?: string;
}

/**
 * Parses a `check` argument like `express`, `express@4.18.2`, `@scope/pkg`, or
 * `@scope/pkg@1.0.0`. The leading @ of a scope is not a version separator, so
 * the split looks for an @ after the first character only.
 */
export function parsePackageSpec(input: string): PackageSpec {
  const trimmed = input.trim();
  const at = trimmed.indexOf("@", 1);
  if (at === -1) return { name: trimmed };
  return { name: trimmed.slice(0, at), version: trimmed.slice(at + 1) };
}
