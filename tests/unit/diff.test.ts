import { describe, expect, it } from "vitest";
import { introducedFacts } from "../../src/core/diff.js";
import type { PackageFacts } from "../../src/core/model.js";

function fact(name: string, version: string, extra: Partial<PackageFacts> = {}): PackageFacts {
  return { name, version, kind: "prod", source: "registry", ...extra };
}

describe("introducedFacts", () => {
  it("returns a brand-new name", () => {
    const base = [fact("a", "1.0.0")];
    const head = [fact("a", "1.0.0"), fact("b", "1.0.0")];
    expect(introducedFacts(base, head).map((f) => f.name)).toEqual(["b"]);
  });

  it("returns a version change (new version is introduced, old is dropped)", () => {
    const base = [fact("a", "1.0.0")];
    const head = [fact("a", "2.0.0")];
    const out = introducedFacts(base, head);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "a", version: "2.0.0" });
  });

  it("treats a downgrade as introduced (a different exact version is new)", () => {
    const base = [fact("a", "2.0.0")];
    const head = [fact("a", "1.0.0")];
    expect(introducedFacts(base, head)[0]).toMatchObject({ name: "a", version: "1.0.0" });
  });

  it("drops name@version pairs unchanged between base and head", () => {
    const base = [fact("a", "1.0.0"), fact("b", "1.0.0")];
    const head = [fact("a", "1.0.0"), fact("b", "1.0.0")];
    expect(introducedFacts(base, head)).toEqual([]);
  });

  it("ignores removed packages (in base, absent from head)", () => {
    const base = [fact("a", "1.0.0"), fact("gone", "1.0.0")];
    const head = [fact("a", "1.0.0")];
    expect(introducedFacts(base, head)).toEqual([]);
  });

  it("keeps a second version of an existing name added alongside the first", () => {
    const base = [fact("a", "1.0.0")];
    const head = [fact("a", "1.0.0"), fact("a", "2.0.0")];
    expect(introducedFacts(base, head)).toHaveLength(1);
    expect(introducedFacts(base, head)[0]).toMatchObject({ version: "2.0.0" });
  });

  it("treats an empty base as introducing everything in head", () => {
    const head = [fact("a", "1.0.0"), fact("b", "2.0.0")];
    expect(introducedFacts([], head)).toHaveLength(2);
  });

  it("surfaces a same-version repoint (integrity change, the poisoning vector)", () => {
    const base = [fact("left-pad", "1.3.0", { integrity: "sha512-legit" })];
    const head = [fact("left-pad", "1.3.0", { integrity: "sha512-EVIL", source: "unknown" })];
    const out = introducedFacts(base, head);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "left-pad", integrity: "sha512-EVIL" });
  });

  it("surfaces a same-version repoint to a different resolved URL", () => {
    const base = [fact("a", "1.0.0", { resolvedUrl: "https://registry.npmjs.org/a" })];
    const head = [fact("a", "1.0.0", { resolvedUrl: "https://evil.example/a" })];
    expect(introducedFacts(base, head)).toHaveLength(1);
  });

  it("keeps an identical entry (same version and identity) out of the diff", () => {
    const base = [fact("a", "1.0.0", { integrity: "sha512-same" })];
    const head = [fact("a", "1.0.0", { integrity: "sha512-same" })];
    expect(introducedFacts(base, head)).toEqual([]);
  });
});
