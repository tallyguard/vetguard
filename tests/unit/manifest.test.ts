import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { classifySource, readManifestFacts } from "../../src/ecosystems/npm/manifest.js";

describe("classifySource", () => {
  it("treats semver ranges as registry sources", () => {
    for (const spec of ["^1.0.0", "~2.3.4", "1.2.3", "*", ">=1 <2", "latest"]) {
      expect(classifySource(spec)).toBe("registry");
    }
  });

  it("classifies non-registry specifiers", () => {
    expect(classifySource("npm:real-pkg@1.0.0")).toBe("alias");
    expect(classifySource("file:../local")).toBe("file");
    expect(classifySource("link:../local")).toBe("link");
    expect(classifySource("workspace:*")).toBe("workspace");
    expect(classifySource("git+https://example.com/x.git")).toBe("git");
    expect(classifySource("github:user/repo")).toBe("git");
    expect(classifySource("user/repo")).toBe("git");
  });
});

describe("readManifestFacts (hostile input)", () => {
  async function writeManifest(content: unknown): Promise<string> {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-manifest-"));
    const body = typeof content === "string" ? content : JSON.stringify(content);
    await writeFile(path.join(d, "package.json"), body, "utf8");
    return d;
  }

  it("reads declared dependencies into facts", async () => {
    const d = await writeManifest({
      dependencies: { express: "^4.0.0" },
      devDependencies: { vitest: "^4" },
    });
    const facts = await readManifestFacts(d);
    expect(facts.find((f) => f.name === "express")?.kind).toBe("prod");
    expect(facts.find((f) => f.name === "vitest")?.kind).toBe("dev");
    await rm(d, { recursive: true, force: true });
  });

  it("throws a clear error for a manifest that is not a JSON object (null)", async () => {
    const d = await writeManifest("null");
    await expect(readManifestFacts(d)).rejects.toThrow(/is not a JSON object/);
    await rm(d, { recursive: true, force: true });
  });

  it("throws for an array manifest", async () => {
    const d = await writeManifest("[1,2]");
    await expect(readManifestFacts(d)).rejects.toThrow(/is not a JSON object/);
    await rm(d, { recursive: true, force: true });
  });

  it("throws for a malformed dependencies block (array), not a silent clean", async () => {
    const d = await writeManifest({ dependencies: ["a", "b"] });
    await expect(readManifestFacts(d)).rejects.toThrow(/dependencies.*is not a JSON object/);
    await rm(d, { recursive: true, force: true });
  });

  it("surfaces a dependency with a non-string version as unverifiable, not a crash", async () => {
    const d = await writeManifest({ dependencies: { foo: null } });
    const facts = await readManifestFacts(d);
    expect(facts.find((f) => f.name === "foo")?.source).toBe("unknown");
    await rm(d, { recursive: true, force: true });
  });

  it("throws a read error when package.json is missing", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-nomani-"));
    await expect(readManifestFacts(d)).rejects.toThrow(/Could not read/);
    await rm(d, { recursive: true, force: true });
  });
});
