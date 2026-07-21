import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { readLockfile, nameFromLockPath } from "../../src/ecosystems/npm/lockfile.js";

describe("nameFromLockPath", () => {
  it("extracts names, handling scopes and nesting", () => {
    expect(nameFromLockPath("node_modules/express")).toBe("express");
    expect(nameFromLockPath("node_modules/@scope/pkg")).toBe("@scope/pkg");
    expect(nameFromLockPath("node_modules/a/node_modules/b")).toBe("b");
    expect(nameFromLockPath("")).toBeUndefined();
    expect(nameFromLockPath("packages/workspace-a")).toBeUndefined();
  });
});

describe("readLockfile", () => {
  async function writeLock(name: string, content: unknown): Promise<string> {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-lock-"));
    await writeFile(path.join(d, name), JSON.stringify(content), "utf8");
    return d;
  }

  it("returns absent when there is no lockfile", async () => {
    const empty = await mkdtemp(path.join(tmpdir(), "vetguard-empty-"));
    expect((await readLockfile(empty)).status).toBe("absent");
    await rm(empty, { recursive: true, force: true });
  });

  it("parses a v3 lockfile into resolved facts", async () => {
    const d = await writeLock("package-lock.json", {
      lockfileVersion: 3,
      packages: {
        "": { name: "root" },
        "node_modules/express": {
          version: "4.18.2",
          resolved: "https://registry.npmjs.org/express/-/express-4.18.2.tgz",
          integrity: "sha512-abc",
        },
        "node_modules/esbuild": {
          version: "0.27.7",
          resolved: "https://registry.npmjs.org/esbuild/-/esbuild-0.27.7.tgz",
          dev: true,
          hasInstallScript: true,
        },
        "node_modules/local-thing": { version: "1.0.0", link: true },
      },
    });
    const out = await readLockfile(d);
    expect(out.status).toBe("ok");
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.lockfileVersion).toBe(3);

    const express = out.facts.find((f) => f.name === "express");
    expect(express?.version).toBe("4.18.2");
    expect(express?.source).toBe("registry");
    expect(express?.kind).toBe("prod");

    const esbuild = out.facts.find((f) => f.name === "esbuild");
    expect(esbuild?.kind).toBe("dev");
    expect(esbuild?.hasInstallScript).toBe(true);

    const local = out.facts.find((f) => f.name === "local-thing");
    expect(local?.source).toBe("link");
    await rm(d, { recursive: true, force: true });
  });

  it("dedupes the same name and version appearing at multiple paths", async () => {
    const d = await writeLock("package-lock.json", {
      lockfileVersion: 3,
      packages: {
        "node_modules/dep": { version: "1.0.0", resolved: "https://registry.npmjs.org/dep" },
        "node_modules/a/node_modules/dep": {
          version: "1.0.0",
          resolved: "https://registry.npmjs.org/dep",
        },
      },
    });
    const out = await readLockfile(d);
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.facts.filter((f) => f.name === "dep")).toHaveLength(1);
    await rm(d, { recursive: true, force: true });
  });

  it("reports v1 as unsupported rather than silently skipping", async () => {
    const d = await writeLock("package-lock.json", {
      lockfileVersion: 1,
      dependencies: { express: { version: "4.18.2" } },
    });
    const out = await readLockfile(d);
    expect(out.status).toBe("unsupported");
    await rm(d, { recursive: true, force: true });
  });

  it("reports malformed JSON as unsupported", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-bad-"));
    await writeFile(path.join(d, "package-lock.json"), "{ not json", "utf8");
    expect((await readLockfile(d)).status).toBe("unsupported");
    await rm(d, { recursive: true, force: true });
  });
});
