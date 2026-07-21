import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadConfig, ConfigError, CONFIG_FILENAME } from "../../src/config.js";

async function withConfig(content: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "vetguard-config-"));
  await writeFile(path.join(dir, CONFIG_FILENAME), content, "utf8");
  return dir;
}

describe("loadConfig", () => {
  it("returns undefined when there is no config file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "vetguard-noconfig-"));
    expect(await loadConfig(dir)).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("loads a valid config", async () => {
    const dir = await withConfig(
      JSON.stringify({
        failOn: "high",
        offline: true,
        ignore: [{ rule: "young-package", package: "our-lib", reason: "first-party" }],
      }),
    );
    const config = await loadConfig(dir);
    expect(config?.failOn).toBe("high");
    expect(config?.offline).toBe(true);
    expect(config?.ignore?.[0]?.reason).toBe("first-party");
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects an ignore without a reason", async () => {
    const dir = await withConfig(
      JSON.stringify({ ignore: [{ rule: "young-package", package: "x" }] }),
    );
    await expect(loadConfig(dir)).rejects.toBeInstanceOf(ConfigError);
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects an ignore with a blank reason", async () => {
    const dir = await withConfig(
      JSON.stringify({ ignore: [{ rule: "young-package", package: "x", reason: "   " }] }),
    );
    await expect(loadConfig(dir)).rejects.toThrow(/reason is required/);
    await rm(dir, { recursive: true, force: true });
  });

  it("rejects an invalid failOn and malformed JSON", async () => {
    const bad = await withConfig(JSON.stringify({ failOn: "sometimes" }));
    await expect(loadConfig(bad)).rejects.toBeInstanceOf(ConfigError);
    await rm(bad, { recursive: true, force: true });

    const broken = await withConfig("{ not json");
    await expect(loadConfig(broken)).rejects.toThrow(/not valid JSON/);
    await rm(broken, { recursive: true, force: true });
  });
});
