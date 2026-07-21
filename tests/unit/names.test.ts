import { describe, expect, it } from "vitest";
import {
  depunctuate,
  edits1,
  classifyTransform,
  keyboardAdjacent,
  tokenize,
  sortedTokenKey,
} from "../../src/util/names.js";

describe("depunctuate", () => {
  it("lowercases and strips separators", () => {
    expect(depunctuate("Foo-Bar_baz.js")).toBe("foobarbazjs");
    expect(depunctuate("cross-env")).toBe("crossenv");
  });
});

describe("edits1", () => {
  it("includes deletions, transpositions, substitutions, insertions", () => {
    const e = edits1("ab");
    expect(e.has("a")).toBe(true); // deletion
    expect(e.has("ba")).toBe(true); // transposition
    expect(e.has("cb")).toBe(true); // substitution
    expect(e.has("acb")).toBe(true); // insertion
    expect(e.has("ab")).toBe(false); // never itself
  });

  it("reaches a real target one edit away", () => {
    expect(edits1("lodahs").has("lodash")).toBe(true); // transposition
    expect(edits1("expres").has("express")).toBe(true); // insertion
    expect(edits1("reactt").has("react")).toBe(true); // deletion
  });
});

describe("classifyTransform", () => {
  it("recognises separator, transposition, substitution, insertion/deletion", () => {
    expect(classifyTransform("crossenv", "cross-env")).toBe("separator");
    expect(classifyTransform("colors", "color")).toBe("insertion"); // trailing-s is a single edit
    expect(classifyTransform("lodahs", "lodash")).toBe("transposition");
    expect(classifyTransform("expres", "express")).toBe("deletion");
    expect(classifyTransform("expresss", "express")).toBe("insertion");
  });

  it("distinguishes keyboard-adjacent from arbitrary substitutions", () => {
    expect(keyboardAdjacent("w", "e")).toBe(true); // adjacent on QWERTY
    expect(keyboardAdjacent("q", "m")).toBe(false); // far apart
    expect(classifyTransform("dwbug", "debug")).toBe("substitution-adjacent"); // e->w, adjacent
    expect(classifyTransform("dxbug", "debug")).toBe("substitution"); // e->x, not adjacent
  });
});

describe("tokenize", () => {
  it("splits on separators, drops scope, numbers, and single chars", () => {
    expect(tokenize("eslint-plugin-unused-imports")).toEqual([
      "eslint",
      "plugin",
      "unused",
      "imports",
    ]);
    expect(tokenize("@tanstack/react-query-devtools")).toEqual(["react", "query", "devtools"]);
    expect(tokenize("core-js-3")).toEqual(["core", "js"]);
    expect(tokenize("lodash")).toEqual(["lodash"]);
  });
});

describe("sortedTokenKey", () => {
  it("is order-independent", () => {
    expect(sortedTokenKey(["react", "router", "dom"])).toBe(
      sortedTokenKey(["dom", "react", "router"]),
    );
  });
});
