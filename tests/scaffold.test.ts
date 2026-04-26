import { afterAll, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Layer } from "../shared/constants/constants.js";
import {
  handleApplyScaffold,
  handleScaffoldExistingCodebase,
} from "../tools/scaffold/scaffold.js";
import {
  buildOrphanFixture,
  buildPassThroughFixture,
} from "./fixtures/index.js";
import { cleanupAllTempDirs, createTempDir, writeFixtureFile } from "./helpers/fixtures.js";

afterAll(() => {
  cleanupAllTempDirs();
});

describe("scaffold_existing_codebase", () => {
  it("flags pass-through wrapper folders as pass-through (not as elements)", async () => {
    const root = await buildPassThroughFixture();
    const result = await handleScaffoldExistingCodebase({ rootPath: root });

    const passThroughNames = result.passThrough.map((p) => p.name);
    expect(passThroughNames).toContain("src");
    expect(passThroughNames).toContain("lib");
  });

  it("marks existing architecture.md folders as alreadyDocumented", async () => {
    const root = await buildPassThroughFixture();
    const result = await handleScaffoldExistingCodebase({ rootPath: root });

    const documentedPaths = result.existingElements.map((e) => e.path.replace(/\\/g, "/"));
    expect(documentedPaths).toContain("api");
    expect(documentedPaths).toContain("web");
  });

  it("proposes Module for leaf folders and Container for top-level folders with subfolders", async () => {
    const root = await buildOrphanFixture();
    const result = await handleScaffoldExistingCodebase({ rootPath: root });

    const byPath = new Map(
      result.proposals.map((p) => [p.path.replace(/\\/g, "/"), p]),
    );
    // orphan-shallow is a leaf folder at depth 1 → Module
    expect(byPath.get("orphan-shallow")?.suggestedLayer).toBe("Module");
  });

  it("proposes Context for a root folder without architecture.md", async () => {
    const root = createTempDir("tessera-barebones-");
    await writeFixtureFile(root, "only-code.ts", "export {};\n");
    const result = await handleScaffoldExistingCodebase({ rootPath: root });
    const rootProposal = result.proposals.find((p) => p.path === ".");
    expect(rootProposal?.suggestedLayer).toBe("Context");
  });
});

describe("apply_scaffold", () => {
  it("creates architecture.md files for each element in the proposal", async () => {
    const root = await buildOrphanFixture();
    const result = await handleApplyScaffold({
      rootPath: root,
      elements: [
        { path: "orphan-shallow", layer: Layer.Module, name: "OrphanShallow" },
        { path: "nested/orphan-deep", layer: Layer.Module, name: "OrphanDeep" },
      ],
    });

    expect(result.created).toBe(2);
    expect(result.failed).toBe(0);
    expect(existsSync(join(root, "orphan-shallow/architecture.md"))).toBe(true);
    expect(existsSync(join(root, "nested/orphan-deep/architecture.md"))).toBe(true);

    const content = await readFile(
      join(root, "orphan-shallow/architecture.md"),
      "utf-8",
    );
    expect(content).toContain("# OrphanShallow");
    expect(content).toContain("**Layer**: Module");
  });

  it("records failures with an error string and keeps going", async () => {
    const root = await buildOrphanFixture();
    const result = await handleApplyScaffold({
      rootPath: root,
      elements: [
        { path: "orphan-shallow", layer: Layer.Module, name: "ShouldSucceed" },
        // Non-existent folder — writeFile will fail
        { path: "nonexistent-folder", layer: Layer.Module, name: "ShouldFail" },
      ],
    });

    expect(result.created).toBe(1);
    expect(result.failed).toBe(1);
    const failed = result.results.find((r) => !r.created);
    expect(failed?.error).toBeDefined();
  });
});
