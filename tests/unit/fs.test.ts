import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  readTextCapped,
  FileTooLargeError,
  contentLengthOver,
  NETWORK_BODY_CAP,
} from "../../src/util/fs.js";

describe("readTextCapped", () => {
  it("reads a file under the cap", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-fs-"));
    const f = path.join(d, "x.txt");
    await writeFile(f, "hello", "utf8");
    expect(await readTextCapped(f, 100)).toBe("hello");
    await rm(d, { recursive: true, force: true });
  });

  it("throws FileTooLargeError over the cap", async () => {
    const d = await mkdtemp(path.join(tmpdir(), "vetguard-fs-"));
    const f = path.join(d, "big.txt");
    await writeFile(f, "x".repeat(50), "utf8");
    await expect(readTextCapped(f, 10)).rejects.toBeInstanceOf(FileTooLargeError);
    await rm(d, { recursive: true, force: true });
  });
});

describe("contentLengthOver", () => {
  const res = (len: string | null) => ({
    headers: new Headers(len === null ? {} : { "content-length": len }),
  });

  it("flags a body over the cap", () => {
    expect(contentLengthOver(res(String(NETWORK_BODY_CAP + 1)), NETWORK_BODY_CAP)).toBe(true);
  });

  it("passes a body under the cap, with no header, or no headers object", () => {
    expect(contentLengthOver(res("100"), NETWORK_BODY_CAP)).toBe(false);
    expect(contentLengthOver(res(null), NETWORK_BODY_CAP)).toBe(false);
    expect(contentLengthOver({}, NETWORK_BODY_CAP)).toBe(false);
  });
});
