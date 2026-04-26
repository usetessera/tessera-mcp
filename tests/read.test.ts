import { afterAll, describe, expect, it } from "vitest";
import {
  handleGetArchitectureTree,
  handleGetElement,
  handleGetElementForFile,
  handleSearchElements,
} from "../tools/read/read.js";
import { buildCleanFixture, buildPassThroughFixture } from "./fixtures/index.js";
import { cleanupAllTempDirs } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("get_architecture_tree", () => {
  it("returns the full tree with correct layer assignments", async () => {
    const root = await buildCleanFixture();
    const tree = await handleGetArchitectureTree({ rootPath: root });

    expect(tree.root.layer).toBe("Context");
    expect(tree.root.children.map((c) => c.name).sort()).toEqual(["api", "web"]);

    const api = tree.root.children.find((c) => c.name === "api")!;
    expect(api.layer).toBe("Container");
    expect(api.children[0].name).toBe("routes");
    expect(api.children[0].layer).toBe("Component");
    expect(api.children[0].children[0].name).toBe("users");
    expect(api.children[0].children[0].layer).toBe("Module");
  });

  it("transparently promotes children of pass-through folders", async () => {
    const root = await buildPassThroughFixture();
    const tree = await handleGetArchitectureTree({ rootPath: root });

    const api = tree.root.children.find((c) => c.name === "api")!;
    // api/src/ is pass-through, so api should directly contain `routes`
    expect(api.children.map((c) => c.name)).toContain("routes");
    expect(api.children.find((c) => c.name === "src")).toBeUndefined();
  });
});

describe("get_element", () => {
  it("returns parsed architecture.md for a valid path", async () => {
    const root = await buildCleanFixture();
    const parsed = await handleGetElement({ rootPath: root, elementPath: "api/routes/users" });
    expect(parsed.name).toBe("Users");
    expect(parsed.metadata.layer).toBe("Module");
    expect(parsed.files?.[0].name).toBe("users.ts");
  });

  it("throws when the architecture.md is missing", async () => {
    const root = await buildCleanFixture();
    await expect(
      handleGetElement({ rootPath: root, elementPath: "does/not/exist" }),
    ).rejects.toThrow();
  });
});

describe("search_elements", () => {
  it("matches by element name", async () => {
    const root = await buildCleanFixture();
    const results = await handleSearchElements({ rootPath: root, query: "button" });
    expect(results.some((r) => r.name === "button" && r.matchField === "name")).toBe(true);
  });

  it("matches by tag", async () => {
    const root = await buildCleanFixture();
    const results = await handleSearchElements({ rootPath: root, query: "frontend" });
    expect(results.some((r) => r.matchField === "tag")).toBe(true);
  });

  it("matches by overview text", async () => {
    const root = await buildCleanFixture();
    const results = await handleSearchElements({ rootPath: root, query: "two containers" });
    expect(results.some((r) => r.matchField === "overview")).toBe(true);
  });

  it("returns an empty array for no matches", async () => {
    const root = await buildCleanFixture();
    const results = await handleSearchElements({ rootPath: root, query: "zzz-no-match" });
    expect(results).toEqual([]);
  });
});

describe("get_element_for_file", () => {
  it("resolves a file deep in the tree to its owning element", async () => {
    const root = await buildCleanFixture();
    const result = await handleGetElementForFile({
      rootPath: root,
      filePath: "api/routes/users/users.ts",
    });
    expect("element" in result).toBe(true);
    if ("element" in result) {
      expect(result.element.name).toBe("users");
      expect(result.element.layer).toBe("Module");
      expect(result.architectureMd?.files?.some((f) => f.name === "users.ts")).toBe(true);
    }
  });

  it("returns a not-found shape for files outside any element", async () => {
    const root = await buildCleanFixture();
    const result = await handleGetElementForFile({
      rootPath: root,
      filePath: "totally/unknown/path.ts",
    });
    expect("error" in result).toBe(true);
  });

  it("accepts an absolute path within rootPath", async () => {
    const root = await buildCleanFixture();
    const result = await handleGetElementForFile({
      rootPath: root,
      filePath: `${root}/web/components/button/button.tsx`,
    });
    expect("element" in result).toBe(true);
    if ("element" in result) {
      expect(result.element.name).toBe("button");
    }
  });
});
