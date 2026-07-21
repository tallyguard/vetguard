import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  readBaseline,
  writeBaseline,
  BaselineError,
  BASELINE_FILENAME,
} from "../../src/baseline-io.js";

async function tempDir(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "vetguard-baseline-"));
}

describe("baseline IO", () => {
  it("returns undefined when there is no baseline file", async () => {
    const dir = await tempDir();
    expect(await readBaseline(dir)).toBeUndefined();
    await rm(dir, { recursive: true, force: true });
  });

  it("round-trips written entries", async () => {
    const dir = await tempDir();
    await writeBaseline(
      dir,
      [
        { rule: "typosquat", package: "a", version: "1.0.0" },
        { rule: "young-package", package: "b" },
      ],
      "2026-07-21T00:00:00.000Z",
    );
    const entries = await readBaseline(dir);
    expect(entries).toEqual([
      { rule: "typosquat", package: "a", version: "1.0.0" },
      { rule: "young-package", package: "b" },
    ]);
    await rm(dir, { recursive: true, force: true });
  });

  it("throws on malformed JSON rather than treating it as empty", async () => {
    const dir = await tempDir();
    await writeFile(path.join(dir, BASELINE_FILENAME), "{ not json", "utf8");
    await expect(readBaseline(dir)).rejects.toBeInstanceOf(BaselineError);
    await rm(dir, { recursive: true, force: true });
  });

  it("throws when findings is missing or an entry is malformed", async () => {
    const dir = await tempDir();
    await writeFile(
      path.join(dir, BASELINE_FILENAME),
      JSON.stringify({ schemaVersion: 1 }),
      "utf8",
    );
    await expect(readBaseline(dir)).rejects.toThrow(/findings array/);

    await writeFile(
      path.join(dir, BASELINE_FILENAME),
      JSON.stringify({ findings: [{ rule: "x" }] }),
      "utf8",
    );
    await expect(readBaseline(dir)).rejects.toBeInstanceOf(BaselineError);
    await rm(dir, { recursive: true, force: true });
  });
});
