import { beforeEach } from "vitest";

/**
 * The default suite must never touch the network: collectors are tested with an
 * injected `fetchImpl` or with `offline: true`. This traps the real global fetch
 * so any test that reaches out (a new scan entry point missing an injected OSV
 * or registry client, say) fails loudly instead of silently hitting a live API.
 */
beforeEach(() => {
  globalThis.fetch = (async (input: unknown) => {
    throw new Error(
      `Network access is forbidden in tests (attempted fetch of ${String(input)}). ` +
        "Inject a fetchImpl or use offline: true.",
    );
  }) as unknown as typeof fetch;
});
